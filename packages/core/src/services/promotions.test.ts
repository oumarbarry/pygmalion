import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { cartLineItemAdjustments, cartLineItems, carts } from '../schema/cart'
import { campaignBudgets } from '../schema/promotions'
import { eq } from 'drizzle-orm'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { base, initCartTotalsState, type CartTotalsState } from './cart-totals'
import { applyCartPromotions, createPromotionsService, type PromotionsService } from './promotions'

let db: PygmalionDatabase
let promotions: PromotionsService
let regionId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  promotions = createPromotionsService({ db })
  await createCurrenciesService({ db }).seed()
  const region = await createRegionsService({ db }).create({ name: 'NA', currencyCode: 'usd' })
  regionId = region.id
})

function itemsState(items: Array<{ id: string; productId?: string | null; unitPrice: number; quantity: number }>): CartTotalsState {
  return base(
    initCartTotalsState({
      currencyCode: 'usd',
      address: null,
      items: items.map((i) => ({ id: i.id, productId: i.productId ?? null, unitPrice: i.unitPrice, quantity: i.quantity, isTaxInclusive: false })),
      shippingMethods: [],
    }),
  )
}

/** `cart_line_item_adjustments.lineItemId` is a real FK -> `cart_line_items.id` — applyCartPromotions's
 * delete+recreate write needs actual rows to point at, not just an in-memory CartTotalsState. */
async function seedCart(cartId: string, items: Array<{ id: string; productId?: string | null; unitPrice: number; quantity: number }>) {
  await db.insert(carts).values({ id: cartId, token: cartId, regionId, currencyCode: 'usd' })
  if (items.length) {
    await db.insert(cartLineItems).values(
      items.map((i) => ({ id: i.id, cartId, productId: i.productId ?? null, title: 'Item', unitPrice: i.unitPrice, quantity: i.quantity })),
    )
  }
}

// --- Admin CRUD -----------------------------------------------------------------

describe('promotions service — CRUD', () => {
  it('creates a promotion with a nested application method + eligibility rules', async () => {
    const p = await promotions.create({
      code: 'SAVE10',
      status: 'active',
      applicationMethod: { target: 'items', allocation: 'each', valueType: 'percentage', value: 10 },
      rules: [{ attribute: 'region_id', operator: 'eq', values: ['reg_1'] }],
    })
    expect(p.id).toMatch(/^promo_/)
    expect(p.code).toBe('SAVE10')
    expect(p.applicationMethod?.value).toBe(10)
    expect(p.rules).toHaveLength(1)
  })

  it('rejects a non-automatic promotion with no code', async () => {
    await expect(
      promotions.create({ applicationMethod: { target: 'items', valueType: 'percentage', value: 10 } }),
    ).rejects.toThrow()
  })

  it('update replaces rules wholesale and patches the application method', async () => {
    const p = await promotions.create({
      code: 'SAVE10',
      applicationMethod: { target: 'items', valueType: 'percentage', value: 10 },
      rules: [{ attribute: 'region_id', operator: 'eq', values: ['reg_1'] }],
    })
    const updated = await promotions.update(p.id, {
      status: 'active',
      rules: [{ attribute: 'region_id', operator: 'eq', values: ['reg_2'] }],
      applicationMethod: { value: 20 },
    })
    expect(updated!.status).toBe('active')
    expect(updated!.rules).toHaveLength(1)
    expect(updated!.rules[0].values).toEqual(['reg_2'])
    expect(updated!.applicationMethod?.value).toBe(20)
  })

  it('remove is a soft delete — get() no longer finds it', async () => {
    const p = await promotions.create({ code: 'GONE', applicationMethod: { target: 'items', valueType: 'fixed', value: 100, currencyCode: 'usd' } })
    await promotions.remove(p.id)
    expect(await promotions.get(p.id)).toBeNull()
  })

  it('batchRules add/remove targets one scope without touching the others', async () => {
    const p = await promotions.create({
      code: 'X',
      applicationMethod: { target: 'items', valueType: 'percentage', value: 10, targetRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_1'] }] },
    })
    const result = await promotions.batchRules(p.id, 'eligibility', { add: [{ attribute: 'region_id', operator: 'eq', values: ['reg_1'] }] })
    expect(result!.rules).toHaveLength(1)
    expect(result!.targetRules).toHaveLength(1) // untouched
  })

  it('ruleAttributeOptions returns the closed attribute set per scope/target', () => {
    expect(promotions.ruleAttributeOptions('rules')).toContain('customer_group_id')
    expect(promotions.ruleAttributeOptions('target-rules', 'items')).toContain('product_category_id')
    expect(promotions.ruleAttributeOptions('target-rules', 'shipping')).toEqual(['shipping_option_id'])
  })
})

describe('promotions service — campaigns', () => {
  it('creates a campaign with a nested budget, attaches promotions', async () => {
    const campaign = await promotions.createCampaign({
      name: 'Summer sale',
      budget: { type: 'spend', currencyCode: 'usd', limitAmount: 10000 },
    })
    const p = await promotions.create({ code: 'SUMMER', applicationMethod: { target: 'items', valueType: 'percentage', value: 10 } })
    await promotions.attachPromotions(campaign.id, { add: [p.id] })
    const full = await promotions.getCampaign(campaign.id)
    expect(full!.budget?.limitAmount).toBe(10000)
    expect(full!.promotions.map((x) => x.id)).toEqual([p.id])
  })

  it('remove is a soft delete', async () => {
    const campaign = await promotions.createCampaign({ name: 'Gone' })
    await promotions.removeCampaign(campaign.id)
    expect(await promotions.getCampaign(campaign.id)).toBeNull()
  })
})

// --- Cart candidate loading + application ---------------------------------------

describe('applyCartPromotions', () => {
  it('applies a manual code, persists an adjustment row with the promotion FK, and reports no unknown codes', async () => {
    await promotions.create({
      code: 'SAVE10',
      status: 'active',
      applicationMethod: { target: 'items', allocation: 'each', valueType: 'percentage', value: 10 },
    })
    await seedCart('cart_1', [{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const state = itemsState([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const result = await applyCartPromotions(db, {
      cartId: 'cart_1',
      manualCodes: ['save10'],
      state,
      currencyCode: 'usd',
      regionId: null,
      customerGroupIds: [],
      attributeValues: {},
    })
    expect(result.unknownCodes).toEqual([])
    expect(result.state.items[0].discountTotal).toBe(100)
    const rows = await db.select().from(cartLineItemAdjustments).where(eq(cartLineItemAdjustments.lineItemId, 'li_1'))
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(100)
    expect(rows[0].code).toBe('SAVE10')
  })

  it('an automatic promotion applies with no code requested', async () => {
    await promotions.create({
      isAutomatic: true,
      status: 'active',
      applicationMethod: { target: 'items', valueType: 'fixed', value: 50, currencyCode: 'usd' },
    })
    await seedCart('cart_1', [{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const state = itemsState([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const result = await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: [], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(result.state.items[0].discountTotal).toBe(50)
  })

  it('reports an unknown manual code and applies nothing for it', async () => {
    await seedCart('cart_1', [{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const state = itemsState([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const result = await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: ['NOPE'], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(result.unknownCodes).toEqual(['NOPE'])
    expect(result.state.items[0].discountTotal).toBe(0)
  })

  it('removing a code (omitting it from manualCodes on the next call) clears its adjustment — delete+recreate parity', async () => {
    await promotions.create({ code: 'SAVE10', status: 'active', applicationMethod: { target: 'items', valueType: 'percentage', value: 10 } })
    await seedCart('cart_1', [{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const state = itemsState([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: ['SAVE10'], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    const second = await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: [], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(second.state.items[0].discountTotal).toBe(0)
    const rows = await db.select().from(cartLineItemAdjustments).where(eq(cartLineItemAdjustments.lineItemId, 'li_1'))
    expect(rows).toHaveLength(0)
  })

  it('a spend budget is decremented on apply and released back when the code is removed (self-correcting across recalcs)', async () => {
    const campaign = await promotions.createCampaign({ name: 'Budgeted', budget: { type: 'spend', currencyCode: 'usd', limitAmount: 500 } })
    const p = await promotions.create({ code: 'BUDGETED', status: 'active', campaignId: campaign.id, applicationMethod: { target: 'items', valueType: 'fixed', value: 400, currencyCode: 'usd' } })

    await seedCart('cart_1', [{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const state = itemsState([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const first = await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: ['BUDGETED'], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(first.state.items[0].discountTotal).toBe(400)
    let [budgetRow] = await db.select().from(campaignBudgets).where(eq(campaignBudgets.campaignId, campaign.id))
    expect(budgetRow.usedAmount).toBe(400)

    // Same cart recalculates again (e.g. another line item changed) with the SAME code still applied:
    // must NOT double count.
    const again = await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: ['BUDGETED'], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(again.state.items[0].discountTotal).toBe(400)
    ;[budgetRow] = await db.select().from(campaignBudgets).where(eq(campaignBudgets.campaignId, campaign.id))
    expect(budgetRow.usedAmount).toBe(400)

    // Code removed -> released back to 0.
    await applyCartPromotions(db, { cartId: 'cart_1', manualCodes: [], state, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    ;[budgetRow] = await db.select().from(campaignBudgets).where(eq(campaignBudgets.campaignId, campaign.id))
    expect(budgetRow.usedAmount).toBe(0)
    void p
  })

  it('a second cart is refused once the spend budget is exhausted by the first', async () => {
    const campaign = await promotions.createCampaign({ name: 'Tight budget', budget: { type: 'spend', currencyCode: 'usd', limitAmount: 400 } })
    await promotions.create({ code: 'TIGHT', status: 'active', campaignId: campaign.id, applicationMethod: { target: 'items', valueType: 'fixed', value: 400, currencyCode: 'usd' } })

    await seedCart('cart_a', [{ id: 'li_a', unitPrice: 1000, quantity: 1 }])
    const stateA = itemsState([{ id: 'li_a', unitPrice: 1000, quantity: 1 }])
    const resultA = await applyCartPromotions(db, { cartId: 'cart_a', manualCodes: ['TIGHT'], state: stateA, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(resultA.state.items[0].discountTotal).toBe(400)

    await seedCart('cart_b', [{ id: 'li_b', unitPrice: 1000, quantity: 1 }])
    const stateB = itemsState([{ id: 'li_b', unitPrice: 1000, quantity: 1 }])
    const resultB = await applyCartPromotions(db, { cartId: 'cart_b', manualCodes: ['TIGHT'], state: stateB, currencyCode: 'usd', regionId: null, customerGroupIds: [], attributeValues: {} })
    expect(resultB.state.items[0].discountTotal).toBe(0) // budget already exhausted by cart_a
  })
})
