import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { cartLineItems, carts } from '../schema/cart'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { createProductsService } from './products'
import { createPricingService } from './pricing'
import { createCustomersService } from './customers'
import { createSystemTaxProvider, createTaxRatesService, createTaxRegionsService, type TaxProvider, type TaxProviderRegistry } from './tax'
import { createCartService, type CartService } from './cart'
// `CartServiceContext.shipping` is a required field;
// these tests never pass `shippingOptionId`, so a stub is enough here (real
// coverage of the resolveForCart path lives in shipping.test.ts).
import type { ShippingService } from './shipping'

const unusedShipping: Pick<ShippingService, 'resolveForCart'> = {
  async resolveForCart() {
    throw new Error('shipping.resolveForCart should not be called by these tests')
  },
}

function fakeProviderRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return {
    get<T>(type: 'tax', id: string): T {
      const p = providers[id]
      if (!p) throw new Error(`no ${type} provider '${id}'`)
      return p as unknown as T
    },
  }
}

let db: PygmalionDatabase
let cart: CartService
let regionId: string
let variantId: string
let productId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  const providers = fakeProviderRegistry({ system: createSystemTaxProvider() })
  const currencies = createCurrenciesService({ db })
  const regions = createRegionsService({ db })
  const products = createProductsService({ db })
  const pricing = createPricingService({ db })
  const taxRegions = createTaxRegionsService({ db, providers })
  const taxRates = createTaxRatesService({ db })
  cart = createCartService({ db, pricing, providers, shipping: unusedShipping })

  await currencies.seed()
  const region = await regions.create({ name: 'North America', currencyCode: 'usd' })
  regionId = region.id

  const product = await products.create({ title: 'Mug' })
  productId = product.id
  const variant = await products.variants.create(product.id, { title: 'Default' })
  variantId = variant.id
  await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })

  // 10% US tax region/rate — used by the address/tax tests below.
  const usRegion = await taxRegions.create({ countryCode: 'US' })
  await taxRates.create({ taxRegionId: usRegion.id, code: 'STD', name: 'Standard', rate: 10, isDefault: true })
})

describe('cart service — create', () => {
  it('creates a cart with a unique token, the region currency, and zeroed totals', async () => {
    const c = await cart.create({ regionId })
    expect(c.id).toMatch(/^cart_/)
    expect(c.token).toBeTruthy()
    expect(c.currencyCode).toBe('usd')
    expect(c.total).toBe(0)
    expect(c.items).toEqual([])
  })

  it('rejects an unknown region', async () => {
    await expect(cart.create({ regionId: 'reg_nope' })).rejects.toThrow(/region not found/)
  })
})

describe('cart service — addItem: price snapshot + recalculated totals', () => {
  it('snapshots productId/title/sku/unitPrice/isTaxInclusive from calculatePrices, and recalculates totals', async () => {
    const created = await cart.create({ regionId })
    const c = await cart.addItem(created.id, { variantId, quantity: 2 })
    expect(c!.items).toHaveLength(1)
    const li = c!.items[0]
    expect(li.productId).toBe(productId)
    expect(li.variantId).toBe(variantId)
    expect(li.title).toBe('Mug')
    expect(li.unitPrice).toBe(1000)
    expect(li.isTaxInclusive).toBe(false)
    expect(li.quantity).toBe(2)
    // No address yet -> no tax; subtotal = total = unitPrice * quantity.
    expect(li.subtotal).toBe(2000)
    expect(li.total).toBe(2000)
    expect(c!.itemsSubtotal).toBe(2000)
    expect(c!.total).toBe(2000)
  })

  it('adding the same variant twice merges into one line (quantity summed)', async () => {
    const created = await cart.create({ regionId })
    await cart.addItem(created.id, { variantId, quantity: 1 })
    const c = await cart.addItem(created.id, { variantId, quantity: 2 })
    expect(c!.items).toHaveLength(1)
    expect(c!.items[0].quantity).toBe(3)
  })

  it('rejects a variant with no price in the cart currency', async () => {
    const products = createProductsService({ db })
    const other = await products.create({ title: 'No price' })
    const otherVariant = await products.variants.create(other.id, { title: 'Default' })
    const created = await cart.create({ regionId })
    await expect(cart.addItem(created.id, { variantId: otherVariant.id, quantity: 1 })).rejects.toThrow(/no price/)
  })
})

describe('cart service — updateItem / removeItem recompute totals every time', () => {
  it('updateItem changes quantity and totals', async () => {
    const created = await cart.create({ regionId })
    const withItem = await cart.addItem(created.id, { variantId, quantity: 1 })
    const lineItemId = withItem!.items[0].id
    const updated = await cart.updateItem(created.id, lineItemId, { quantity: 5 })
    expect(updated!.items[0].quantity).toBe(5)
    expect(updated!.items[0].total).toBe(5000)
    expect(updated!.total).toBe(5000)
  })

  it('removeItem deletes the line and zeroes totals back out', async () => {
    const created = await cart.create({ regionId })
    const withItem = await cart.addItem(created.id, { variantId, quantity: 1 })
    const lineItemId = withItem!.items[0].id
    const after = await cart.removeItem(created.id, lineItemId)
    expect(after!.items).toEqual([])
    expect(after!.total).toBe(0)
    const rows = await db.select().from(cartLineItems).where(eq(cartLineItems.id, lineItemId))
    expect(rows).toHaveLength(0)
  })
})

describe('cart service — setAddresses triggers a tax recalculation', () => {
  it('a US shipping address activates the 10% tax rate seeded in beforeEach', async () => {
    const created = await cart.create({ regionId })
    await cart.addItem(created.id, { variantId, quantity: 1 })
    const withAddress = await cart.setAddresses(created.id, { shippingAddress: { countryCode: 'US' } })
    const li = withAddress!.items[0]
    expect(li.taxTotal).toBe(100) // 10% of 1000
    expect(li.total).toBe(1100)
    expect(withAddress!.taxTotal).toBe(100)
    expect(withAddress!.total).toBe(1100)
    const row = await db.select().from(carts).where(eq(carts.id, created.id))
    expect(row[0].shippingCountryCode).toBe('us')
  })
})

describe('cart service — setEmail', () => {
  it('lowercases and trims the email', async () => {
    const created = await cart.create({ regionId })
    const c = await cart.setEmail(created.id, { email: '  Person@Example.com ' })
    expect(c!.email).toBe('person@example.com')
  })
})

describe('cart service — setShippingMethod (caller supplies name + amount directly)', () => {
  it('replaces any previous method and folds the amount into totals', async () => {
    const created = await cart.create({ regionId })
    await cart.addItem(created.id, { variantId, quantity: 1 })
    const withShipping = await cart.setShippingMethod(created.id, { name: 'Standard', amount: 500 })
    expect(withShipping!.shippingMethods).toHaveLength(1)
    expect(withShipping!.shippingMethods[0].amount).toBe(500)
    expect(withShipping!.shippingTotal).toBe(500)
    expect(withShipping!.total).toBe(1500)

    // Setting again replaces, not appends.
    const replaced = await cart.setShippingMethod(created.id, { name: 'Express', amount: 1500 })
    expect(replaced!.shippingMethods).toHaveLength(1)
    expect(replaced!.shippingMethods[0].name).toBe('Express')
    expect(replaced!.total).toBe(2500)
  })
})

describe('cart service — recalcTaxes forces a fresh tax resolution', () => {
  it('re-running after an address change picks up the new rate', async () => {
    const created = await cart.create({ regionId })
    await cart.addItem(created.id, { variantId, quantity: 1 })
    const c = await cart.recalcTaxes(created.id)
    expect(c!.taxTotal).toBe(0) // still no address
  })
})

describe('cart service — transferToCustomer (guest -> customer)', () => {
  it('sets customerId and emits cart.customer_transferred', async () => {
    const customers = createCustomersService({ db })
    const guest = await customers.ensureGuest('shopper@test.dev')
    const created = await cart.create({ regionId })
    const c = await cart.transferToCustomer(created.id, { customerId: guest.id })
    expect(c!.customerId).toBe(guest.id)
  })
})

