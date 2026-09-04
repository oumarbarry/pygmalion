import { describe, expect, it } from 'vitest'
import { base, initCartTotalsState, type CartTotalsState } from './cart-totals'
import {
  computeAdjustments,
  type ApplicationMethodEngineInput,
  type PromotionEligibilityContext,
  type PromotionEngineInput,
} from './promotions-engine'

// --- Fixtures ------------------------------------------------------------------

function stateWithItems(items: Array<{ id: string; productId?: string; unitPrice: number; quantity: number }>, shippingMethods: Array<{ id: string; amount: number }> = []): CartTotalsState {
  return base(
    initCartTotalsState({
      currencyCode: 'usd',
      address: null,
      items: items.map((i) => ({ id: i.id, productId: i.productId ?? null, unitPrice: i.unitPrice, quantity: i.quantity, isTaxInclusive: false })),
      shippingMethods: shippingMethods.map((s) => ({ id: s.id, shippingOptionId: null, amount: s.amount, isTaxInclusive: false })),
    }),
  )
}

const baseContext: PromotionEligibilityContext = {
  now: new Date('2026-01-15T00:00:00Z'),
  currencyCode: 'usd',
  regionId: 'reg_1',
  customerGroupIds: [],
  attributeValues: {},
  items: {},
  shippingMethods: {},
}

function app(overrides: Partial<ApplicationMethodEngineInput>): ApplicationMethodEngineInput {
  return {
    target: 'items',
    allocation: 'each',
    valueType: 'percentage',
    value: 10,
    maxQuantity: null,
    buyRulesMinQuantity: null,
    applyToQuantity: null,
    targetRules: [],
    buyRules: [],
    ...overrides,
  }
}

function promo(id: string, overrides: Partial<PromotionEngineInput> = {}): PromotionEngineInput {
  return {
    id,
    code: `CODE_${id}`,
    type: 'standard',
    rules: [],
    application: app({}),
    campaign: null,
    ...overrides,
  }
}

// --- Eligibility ---------------------------------------------------------------

describe('promotions-engine — eligibility rules', () => {
  it('customer_group_id: rejects when the customer is not in the required group', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', { rules: [{ attribute: 'customer_group_id', operator: 'eq', values: ['grp_vip'] }] })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments).toHaveLength(0)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'ineligible' }])
  })

  it('customer_group_id: applies when the customer IS in the group (OR across a rule\'s values)', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', { rules: [{ attribute: 'customer_group_id', operator: 'eq', values: ['grp_vip', 'grp_staff'] }] })
    const ctx = { ...baseContext, customerGroupIds: ['grp_staff'] }
    const result = computeAdjustments(state, [p], ctx)
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0].amount).toBe(100) // 10% of 1000
  })

  it('region_id: eligibility gated by the cart region', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', { rules: [{ attribute: 'region_id', operator: 'eq', values: ['reg_other'] }] })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.rejected[0]).toEqual({ promotionId: 'promo_1', reason: 'ineligible' })
  })

  it('cart_subtotal: gte comparison against the pre-discount items subtotal', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const tooHigh = promo('promo_1', { rules: [{ attribute: 'cart_subtotal', operator: 'gte', values: ['5000'] }] })
    expect(computeAdjustments(state, [tooHigh], baseContext).adjustments).toHaveLength(0)
    const passes = promo('promo_2', { rules: [{ attribute: 'cart_subtotal', operator: 'gte', values: ['500'] }] })
    expect(computeAdjustments(state, [passes], baseContext).adjustments).toHaveLength(1)
  })

  it('items targeted by product_id/product_category_id: only matching lines get an adjustment', () => {
    const state = stateWithItems([
      { id: 'li_1', productId: 'prod_a', unitPrice: 1000, quantity: 1 },
      { id: 'li_2', productId: 'prod_b', unitPrice: 1000, quantity: 1 },
    ])
    const ctx: PromotionEligibilityContext = {
      ...baseContext,
      items: {
        li_1: { productId: 'prod_a', categoryIds: ['cat_shoes'], tagIds: [], productTypeId: null },
        li_2: { productId: 'prod_b', categoryIds: ['cat_hats'], tagIds: [], productTypeId: null },
      },
    }
    const p = promo('promo_1', { application: app({ targetRules: [{ attribute: 'product_category_id', operator: 'eq', values: ['cat_shoes'] }] }) })
    const result = computeAdjustments(state, [p], ctx)
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0].targetId).toBe('li_1')
  })
})

// --- Allocation (largest-remainder) -------------------------------------------

describe('promotions-engine — allocation', () => {
  it('each: percentage applied independently to every eligible line', () => {
    const state = stateWithItems([
      { id: 'li_1', unitPrice: 1000, quantity: 1 },
      { id: 'li_2', unitPrice: 2000, quantity: 1 },
    ])
    const p = promo('promo_1', { application: app({ allocation: 'each', valueType: 'percentage', value: 10 }) })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments.find((a) => a.targetId === 'li_1')!.amount).toBe(100)
    expect(result.adjustments.find((a) => a.targetId === 'li_2')!.amount).toBe(200)
  })

  it('each: fixed value capped by maxQuantity units', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 300, quantity: 5 }])
    // $1 off/unit, max 2 units -> 200 cents, well under the 1500 line subtotal.
    const p = promo('promo_1', { application: app({ allocation: 'each', valueType: 'fixed', value: 100, maxQuantity: 2 }) })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments[0].amount).toBe(200)
  })

  it('each: never discounts a line below zero (capped at remaining)', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 100, quantity: 1 }])
    const p = promo('promo_1', { application: app({ allocation: 'each', valueType: 'fixed', value: 500 }) })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments[0].amount).toBe(100)
  })

  it('across: money.allocate (largest remainder) splits a flat total with no cent lost', () => {
    // 3 lines of equal subtotal (1000 each = 3000 total), 10% across = 300,
    // split 100/100/100 exactly (no remainder to test the edge here)...
    const state = stateWithItems([
      { id: 'li_1', unitPrice: 1000, quantity: 1 },
      { id: 'li_2', unitPrice: 1000, quantity: 1 },
      { id: 'li_3', unitPrice: 1000, quantity: 1 },
    ])
    // ...use a percentage that forces a genuine remainder: 1/3 of 3000 = 1000 exactly,
    // so force an odd total instead: a fixed 100 cents split 3 ways -> 34/33/33.
    const p = promo('promo_1', { application: app({ target: 'order', allocation: 'across', valueType: 'fixed', value: 100 }) })
    const result = computeAdjustments(state, [p], baseContext)
    const amounts = result.adjustments.map((a) => a.amount).sort((a, b) => b - a)
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100) // no cent lost or invented
    expect(amounts).toEqual([34, 33, 33])
  })

  it('once: applies per-unit value to the cheapest units first, up to maxQuantity total units across all lines', () => {
    const state = stateWithItems([
      { id: 'li_cheap', unitPrice: 500, quantity: 2 },
      { id: 'li_pricey', unitPrice: 2000, quantity: 2 },
    ])
    // $2 off, 3 units total across the whole cart, cheapest first.
    const p = promo('promo_1', { application: app({ target: 'order', allocation: 'once', valueType: 'fixed', value: 200, maxQuantity: 3 }) })
    const result = computeAdjustments(state, [p], baseContext)
    // li_cheap: 2 units * 200 = 400. li_pricey: 1 remaining unit * 200 = 200.
    expect(result.adjustments.find((a) => a.targetId === 'li_cheap')!.amount).toBe(400)
    expect(result.adjustments.find((a) => a.targetId === 'li_pricey')!.amount).toBe(200)
  })

  it('target=shipping: discounts the shipping method, not items', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }], [{ id: 'sm_1', amount: 800 }])
    const p = promo('promo_1', { application: app({ target: 'shipping', allocation: 'each', valueType: 'percentage', value: 50 }) })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments).toEqual([{ target: 'shipping', targetId: 'sm_1', promotionId: 'promo_1', code: 'CODE_promo_1', description: 'Promotion CODE_promo_1', amount: 400 }])
  })

  it('target=order: every item is eligible regardless of targetRules', () => {
    const state = stateWithItems([
      { id: 'li_1', unitPrice: 1000, quantity: 1 },
      { id: 'li_2', unitPrice: 1000, quantity: 1 },
    ])
    const p = promo('promo_1', { application: app({ target: 'order', allocation: 'each', valueType: 'percentage', value: 10, targetRules: [{ attribute: 'product_id', operator: 'eq', values: ['nonexistent'] }] }) })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments).toHaveLength(2)
  })
})

// --- Stacking (deterministic order, remaining-amount base) -------------------

describe('promotions-engine — stacking', () => {
  it('2 promotions apply in a stable, deterministic order — the second computes on the amount already discounted by the first', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    // Higher value first (value desc tie-break).
    const p1 = promo('promo_a', { application: app({ allocation: 'each', valueType: 'percentage', value: 20 }) })
    const p2 = promo('promo_b', { application: app({ allocation: 'each', valueType: 'percentage', value: 10 }) })
    const result = computeAdjustments(state, [p2, p1], baseContext) // passed in reverse order on purpose
    const a = result.adjustments.find((x) => x.promotionId === 'promo_a')!
    const b = result.adjustments.find((x) => x.promotionId === 'promo_b')!
    expect(a.amount).toBe(200) // 20% of 1000
    expect(b.amount).toBe(80) // 10% of the REMAINING 800, not the original 1000
    expect(result.state.items[0].discountTotal).toBe(280)
  })

  it('is stable across repeated calls with the same input (same order every time)', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p1 = promo('promo_a', { application: app({ value: 10 }) })
    const p2 = promo('promo_b', { application: app({ value: 10 }) }) // same value -> id tie-break
    const r1 = computeAdjustments(state, [p1, p2], baseContext)
    const r2 = computeAdjustments(state, [p2, p1], baseContext)
    expect(r1.adjustments.map((a) => a.promotionId)).toEqual(r2.adjustments.map((a) => a.promotionId))
  })
})

// --- Campaign windows + budgets ------------------------------------------------

describe('promotions-engine — campaign window', () => {
  it('rejects a promotion whose campaign has not started yet', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', { campaign: { startsAt: new Date('2027-01-01'), endsAt: null, budget: null } })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'inactive_window' }])
  })

  it('rejects a promotion whose campaign already ended', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', { campaign: { startsAt: null, endsAt: new Date('2025-01-01'), budget: null } })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'inactive_window' }])
  })
})

describe('promotions-engine — campaign budgets', () => {
  it('spend budget: refuses once the discount would exceed the remaining limit', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 10000, quantity: 1 }])
    const p = promo('promo_1', {
      application: app({ allocation: 'each', valueType: 'fixed', value: 5000 }),
      campaign: { startsAt: null, endsAt: null, budget: { id: 'bud_1', type: 'spend', limit: 4000, usedByOthers: 0, attribute: null, usedByOthersForAttributeValue: 0 } },
    })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments).toHaveLength(0)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'budget_exceeded' }])
  })

  it('spend budget: applies and reports the delta when within the limit', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 10000, quantity: 1 }])
    const p = promo('promo_1', {
      application: app({ allocation: 'each', valueType: 'fixed', value: 2000 }),
      campaign: { startsAt: null, endsAt: null, budget: { id: 'bud_1', type: 'spend', limit: 4000, usedByOthers: 1000, attribute: null, usedByOthersForAttributeValue: 0 } },
    })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.adjustments[0].amount).toBe(2000)
    expect(result.budgetDeltas).toEqual([{ promotionId: 'promo_1', budgetId: 'bud_1', type: 'spend', amount: 2000, attributeValue: null }])
  })

  it('usage budget: refuses once the count limit is already reached', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', {
      campaign: { startsAt: null, endsAt: null, budget: { id: 'bud_1', type: 'usage', limit: 3, usedByOthers: 3, attribute: null, usedByOthersForAttributeValue: 0 } },
    })
    const result = computeAdjustments(state, [p], baseContext)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'budget_exceeded' }])
  })

  it('use_by_attribute budget: scoped per resolved attribute value (e.g. one use per customer)', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', {
      campaign: {
        startsAt: null,
        endsAt: null,
        budget: { id: 'bud_1', type: 'use_by_attribute', limit: 1, usedByOthers: 5, attribute: 'customer_id', usedByOthersForAttributeValue: 1 },
      },
    })
    const ctx = { ...baseContext, attributeValues: { customer_id: 'cus_1' } }
    const result = computeAdjustments(state, [p], ctx)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'budget_exceeded' }])
  })

  it('use_by_attribute budget: allows and reports the resolved attribute value when under the limit', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', {
      campaign: {
        startsAt: null,
        endsAt: null,
        budget: { id: 'bud_1', type: 'use_by_attribute', limit: 1, usedByOthers: 5, attribute: 'customer_id', usedByOthersForAttributeValue: 0 },
      },
    })
    const ctx = { ...baseContext, attributeValues: { customer_id: 'cus_1' } }
    const result = computeAdjustments(state, [p], ctx)
    expect(result.adjustments).toHaveLength(1)
    expect(result.budgetDeltas).toEqual([{ promotionId: 'promo_1', budgetId: 'bud_1', type: 'use_by_attribute', amount: 1, attributeValue: 'cus_1' }])
  })
})

// --- BuyGet (full parity) ------------------------------------------------------

describe('promotions-engine — BuyGet', () => {
  it('"buy 2 get 1 free" across TWO different lines (multi-line, the required parity case)', () => {
    const state = stateWithItems([
      { id: 'li_buy', productId: 'prod_a', unitPrice: 1000, quantity: 2 },
      { id: 'li_get', productId: 'prod_b', unitPrice: 700, quantity: 1 },
    ])
    const ctx: PromotionEligibilityContext = {
      ...baseContext,
      items: {
        li_buy: { productId: 'prod_a', categoryIds: [], tagIds: [], productTypeId: null },
        li_get: { productId: 'prod_b', categoryIds: [], tagIds: [], productTypeId: null },
      },
    }
    const p = promo('promo_1', {
      type: 'buyget',
      application: app({
        allocation: 'each',
        valueType: 'percentage',
        value: 100,
        buyRulesMinQuantity: 2,
        applyToQuantity: 1,
        buyRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_a'] }],
        targetRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_b'] }],
      }),
    })
    const result = computeAdjustments(state, [p], ctx)
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0]).toMatchObject({ targetId: 'li_get', amount: 700 })
    expect(result.state.items.find((i) => i.id === 'li_get')!.discountTotal).toBe(700)
    expect(result.state.items.find((i) => i.id === 'li_buy')!.discountTotal).toBe(0)
  })

  it('bounded: not enough buy-eligible quantity for even one cycle -> no discount', () => {
    const state = stateWithItems([
      { id: 'li_buy', productId: 'prod_a', unitPrice: 1000, quantity: 1 }, // needs 2, only 1 in cart
      { id: 'li_get', productId: 'prod_b', unitPrice: 700, quantity: 1 },
    ])
    const ctx: PromotionEligibilityContext = {
      ...baseContext,
      items: {
        li_buy: { productId: 'prod_a', categoryIds: [], tagIds: [], productTypeId: null },
        li_get: { productId: 'prod_b', categoryIds: [], tagIds: [], productTypeId: null },
      },
    }
    const p = promo('promo_1', {
      type: 'buyget',
      application: app({
        valueType: 'percentage',
        value: 100,
        buyRulesMinQuantity: 2,
        applyToQuantity: 1,
        buyRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_a'] }],
        targetRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_b'] }],
      }),
    })
    const result = computeAdjustments(state, [p], ctx)
    expect(result.adjustments).toHaveLength(0)
    expect(result.rejected).toEqual([{ promotionId: 'promo_1', reason: 'no_target' }])
  })

  it('multiple cycles: "buy 2 get 1" with 4 buy-eligible units yields 2 cycles -> 2 units discounted', () => {
    const state = stateWithItems([
      { id: 'li_buy', productId: 'prod_a', unitPrice: 1000, quantity: 4 },
      { id: 'li_get', productId: 'prod_b', unitPrice: 300, quantity: 3 },
    ])
    const ctx: PromotionEligibilityContext = {
      ...baseContext,
      items: {
        li_buy: { productId: 'prod_a', categoryIds: [], tagIds: [], productTypeId: null },
        li_get: { productId: 'prod_b', categoryIds: [], tagIds: [], productTypeId: null },
      },
    }
    const p = promo('promo_1', {
      type: 'buyget',
      application: app({
        valueType: 'percentage',
        value: 100,
        buyRulesMinQuantity: 2,
        applyToQuantity: 1,
        buyRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_a'] }],
        targetRules: [{ attribute: 'product_id', operator: 'eq', values: ['prod_b'] }],
      }),
    })
    const result = computeAdjustments(state, [p], ctx)
    // 2 cycles * applyToQuantity 1 = 2 units of li_get discounted (300 each = 600).
    expect(result.adjustments[0].amount).toBe(600)
  })
})

// --- Frozen contract (cart-totals.ts header) ------------------------------------

describe('promotions-engine — respects the frozen cart-totals contract', () => {
  it('only ever writes discountTotal — subtotal/taxTotal/total on the returned state are untouched', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 1000, quantity: 1 }])
    const p = promo('promo_1', { application: app({ value: 10 }) })
    const result = computeAdjustments(state, [p], baseContext)
    const li = result.state.items[0]
    expect(li.subtotal).toBe(1000)
    expect(li.total).toBe(1000) // unchanged — `tax` step (after promotions) owns total
    expect(li.taxTotal).toBe(0)
    expect(li.discountTotal).toBe(100)
  })

  it('never discounts a line beyond its own subtotal (no negative total)', () => {
    const state = stateWithItems([{ id: 'li_1', unitPrice: 100, quantity: 1 }])
    const p1 = promo('promo_a', { application: app({ valueType: 'percentage', value: 80 }) })
    const p2 = promo('promo_b', { application: app({ valueType: 'percentage', value: 80 }) })
    const result = computeAdjustments(state, [p1, p2], baseContext)
    expect(result.state.items[0].discountTotal).toBeLessThanOrEqual(100)
  })
})
