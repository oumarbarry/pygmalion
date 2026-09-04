import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { prices } from '../schema/pricing'
import { pricePreferences } from '../schema/settings'
import type { PygmalionDatabase } from '../db/types'
import { createProductsService } from './products'
import { createPricingService } from './pricing'

let db: PygmalionDatabase
let products: ReturnType<typeof createProductsService>
let pricing: ReturnType<typeof createPricingService>
let variantId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  products = createProductsService({ db })
  pricing = createPricingService({ db })
  await db.insert(schema.currencies).values([
    { code: 'usd', symbol: '$', symbolNative: '$', name: 'US Dollar', decimalDigits: 2 },
    { code: 'eur', symbol: '€', symbolNative: '€', name: 'Euro', decimalDigits: 2 },
  ])
  const product = await products.create({ title: 'Mug' })
  const variant = await products.variants.create(product.id, { title: 'Default' })
  variantId = variant.id
})

async function calc(ids: string[], context: Parameters<typeof pricing.calculatePrices>[1]) {
  const map = await pricing.calculatePrices(ids, context)
  return map.get(ids[0])!
}

describe('pricing service — schema', () => {
  it('CHECK prices_exactly_one_owner rejects neither owner and both owners', async () => {
    await expect(db.insert(prices).values({ id: 'price_x', currencyCode: 'usd', amount: 100 })).rejects.toThrow()
    await expect(
      db.insert(prices).values({ id: 'price_y', variantId, shippingOptionId: 'so_1', currencyCode: 'usd', amount: 100 }),
    ).rejects.toThrow()
  })
})

describe('pricing service — calculatePrices precedence', () => {
  it('no price for the context → calculated/original are null', async () => {
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBeNull()
    expect(r.originalAmount).toBeNull()
    expect(r.calculatedPriceId).toBeNull()
  })

  it('single default price, no rules, no quantity → calculated = original = default', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(1000)
    expect(r.originalAmount).toBe(1000)
  })

  it('OVERRIDE price list wins unconditionally, even when the default is cheaper', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 500 }] })
    const list = await pricing.createPriceList({ title: 'VIP override', status: 'active', type: 'override' })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 900, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(900)
    expect(r.originalAmount).toBe(900)
    expect(r.priceListType).toBe('override')
  })

  it('SALE price list picks min(sale, default) — default wins if the sale is misconfigured higher', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 500 }] })
    const list = await pricing.createPriceList({ title: 'Bad sale', status: 'active', type: 'sale' })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 900, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(500)
  })

  it('SALE price list wins when cheaper than default', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const list = await pricing.createPriceList({ title: 'Sale', status: 'active', type: 'sale' })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 700, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(700)
  })

  it('SALE original_price is the default (catalog strikethrough price), not the sale amount', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const list = await pricing.createPriceList({ title: 'Sale', status: 'active', type: 'sale' })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 700, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.originalAmount).toBe(1000)
  })

  it('SALE original_price is not clobbered: falls back to an active OVERRIDE elsewhere, not the default', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const sale = await pricing.createPriceList({ title: 'Sale', status: 'active', type: 'sale' })
    const override = await pricing.createPriceList({ title: 'Override', status: 'active', type: 'override' })
    await pricing.batchPrices({
      create: [
        { variantId, currencyCode: 'usd', amount: 700, priceListId: sale.id },
        { variantId, currencyCode: 'usd', amount: 850, priceListId: override.id },
      ],
    })
    const r = await calc([variantId], { currencyCode: 'usd' })
    // The override outranks the sale in the sort (more specific tie? both 0
    // rules — list-with-rules first, amount asc breaks the tie between the two
    // list prices) so the override could itself be selected as priceListPrice;
    // either way original_price must be the override's amount, never the plain default.
    expect(r.originalAmount).toBe(850)
    expect(r.originalAmount).not.toBe(1000)
  })

  it('price_rule ET strict: a price with 2 rules is excluded unless BOTH match', async () => {
    await pricing.batchPrices({
      create: [
        {
          variantId,
          currencyCode: 'usd',
          amount: 750,
          rules: [
            { attribute: 'region_id', value: 'reg_eu' },
            { attribute: 'customer_group_id', value: 'cg_vip' },
          ],
        },
        { variantId, currencyCode: 'usd', amount: 1200 },
      ],
    })
    // Only region matches -> the 2-rule price is excluded, default wins.
    const partial = await calc([variantId], { currencyCode: 'usd', regionId: 'reg_eu' })
    expect(partial.calculatedAmount).toBe(1200)
    // Both match -> the rule-scoped price wins (more specific).
    const full = await calc([variantId], { currencyCode: 'usd', regionId: 'reg_eu', customerGroupIds: ['cg_vip'] })
    expect(full.calculatedAmount).toBe(750)
  })

  it('price_list_rule ET strict on the list (containment over an array of eligible values)', async () => {
    const list = await pricing.createPriceList({
      title: 'EU sale',
      status: 'active',
      type: 'sale',
      rules: [{ attribute: 'region_id', value: ['reg_eu', 'reg_uk'] }],
    })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 600, priceListId: list.id }] })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    expect((await calc([variantId], { currencyCode: 'usd', regionId: 'reg_us' })).calculatedAmount).toBe(1000)
    expect((await calc([variantId], { currencyCode: 'usd', regionId: 'reg_eu' })).calculatedAmount).toBe(600)
  })

  it('expired price list (endsAt in the past) falls back silently to default', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const list = await pricing.createPriceList({
      title: 'Past sale',
      status: 'active',
      type: 'sale',
      endsAt: new Date(Date.now() - 86_400_000),
    })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 100, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(1000)
    expect(r.priceListId).toBeNull()
  })

  it('future price list (startsAt not yet reached) falls back silently to default', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const list = await pricing.createPriceList({
      title: 'Future sale',
      status: 'active',
      type: 'sale',
      startsAt: new Date(Date.now() + 86_400_000),
    })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 100, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(1000)
  })

  it('draft (inactive) price list is invisible even inside its start/end window', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const list = await pricing.createPriceList({ title: 'Draft sale', status: 'draft', type: 'sale' })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 100, priceListId: list.id }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBe(1000)
  })

  it('quantity break: a min_quantity>1 tier is invisible unless quantity is given in context', async () => {
    await pricing.batchPrices({
      create: [
        { variantId, currencyCode: 'usd', amount: 1000 },
        { variantId, currencyCode: 'usd', amount: 800, minQuantity: 10 },
      ],
    })
    expect((await calc([variantId], { currencyCode: 'usd' })).calculatedAmount).toBe(1000)
    expect((await calc([variantId], { currencyCode: 'usd', quantity: 5 })).calculatedAmount).toBe(1000)
    expect((await calc([variantId], { currencyCode: 'usd', quantity: 10 })).calculatedAmount).toBe(800)
  })

  it('without quantity in context, only the min_quantity<=1 default tier is visible', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 800, minQuantity: 10, maxQuantity: 50 }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBeNull()
  })

  it('partial context: currency-only (no region/group) still resolves the plain default price', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'eur', amount: 300 }] })
    const r = await calc([variantId], { currencyCode: 'eur' })
    expect(r.calculatedAmount).toBe(300)
  })

  it('tax inclusive: region preference applies only when the price has a matching region rule', async () => {
    await db.insert(pricePreferences).values({ id: 'prpref_region', attribute: 'region_id', value: 'reg_eu', isTaxInclusive: true })
    await pricing.batchPrices({
      create: [{ variantId, currencyCode: 'usd', amount: 1000, rules: [{ attribute: 'region_id', value: 'reg_eu' }] }],
    })
    const r = await calc([variantId], { currencyCode: 'usd', regionId: 'reg_eu' })
    expect(r.isCalculatedPriceTaxInclusive).toBe(true)
  })

  it('tax inclusive: false when the price matches by other means but carries no region_id rule itself', async () => {
    await db.insert(pricePreferences).values({ id: 'prpref_region', attribute: 'region_id', value: 'reg_eu', isTaxInclusive: true })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const r = await calc([variantId], { currencyCode: 'usd', regionId: 'reg_eu' })
    expect(r.isCalculatedPriceTaxInclusive).toBe(false)
  })

  it('tax inclusive: falls back to the currency preference when no region rule/preference applies', async () => {
    await db.insert(pricePreferences).values({ id: 'prpref_cur', attribute: 'currency_code', value: 'usd', isTaxInclusive: true })
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.isCalculatedPriceTaxInclusive).toBe(true)
  })

  it('tax inclusive: false when neither a region nor a currency preference exists', async () => {
    await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.isCalculatedPriceTaxInclusive).toBe(false)
  })

  it('currencyCode is required', async () => {
    // @ts-expect-error deliberately omitted for the runtime guard
    await expect(pricing.calculatePrices([variantId], {})).rejects.toThrow(/currencyCode/)
  })

  it('resolves multiple ids independently in one call', async () => {
    const product2 = await products.create({ title: 'Plate' })
    const variant2 = await products.variants.create(product2.id, { title: 'Default' })
    await pricing.batchPrices({
      create: [
        { variantId, currencyCode: 'usd', amount: 1000 },
        { variantId: variant2.id, currencyCode: 'usd', amount: 2000 },
      ],
    })
    const map = await pricing.calculatePrices([variantId, variant2.id], { currencyCode: 'usd' })
    expect(map.get(variantId)?.calculatedAmount).toBe(1000)
    expect(map.get(variant2.id)?.calculatedAmount).toBe(2000)
  })
})

describe('pricing service — price lists + batch prices CRUD', () => {
  it('createPriceList/get/list/update/remove', async () => {
    const list = await pricing.createPriceList({ title: 'Winter', type: 'sale' })
    expect(list.id).toMatch(/^plist_/)
    expect(list.status).toBe('draft')
    expect((await pricing.getPriceList(list.id))?.title).toBe('Winter')
    expect((await pricing.listPriceLists({})).map((l) => l.id)).toContain(list.id)

    const updated = await pricing.updatePriceList(list.id, { status: 'active' })
    expect(updated?.status).toBe('active')

    const removed = await pricing.removePriceList(list.id)
    expect(removed?.deletedAt).not.toBeNull()
    expect(await pricing.getPriceList(list.id)).toBeNull()
  })

  it('batchPrices creates, updates and soft-deletes in one call', async () => {
    const { created } = await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
    const priceId = created[0].id

    const { updated } = await pricing.batchPrices({ update: [{ id: priceId, amount: 1200 }] })
    expect(updated[0].amount).toBe(1200)

    await pricing.batchPrices({ delete: [priceId] })
    const r = await calc([variantId], { currencyCode: 'usd' })
    expect(r.calculatedAmount).toBeNull()
  })

  it('addProductsToList forces the price list id on every created price', async () => {
    const list = await pricing.createPriceList({ title: 'Bundle', type: 'override', status: 'active' })
    await pricing.addProductsToList(list.id, { prices: [{ variantId, currencyCode: 'usd', amount: 555 }] })
    const listed = await pricing.listPrices(list.id, {})
    expect(listed).toHaveLength(1)
    expect(listed[0].priceListId).toBe(list.id)
    expect(listed[0].amount).toBe(555)
  })

  it('rejects a create with neither or both of variantId/shippingOptionId', async () => {
    await expect(pricing.batchPrices({ create: [{ currencyCode: 'usd', amount: 100 } as never] })).rejects.toThrow()
    await expect(
      pricing.batchPrices({ create: [{ variantId, shippingOptionId: 'so_1', currencyCode: 'usd', amount: 100 } as never] }),
    ).rejects.toThrow()
  })
})
