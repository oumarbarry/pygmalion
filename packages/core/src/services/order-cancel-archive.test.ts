import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { orders } from '../schema/orders'
import { outbox } from '../schema/outbox'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { createProductsService } from './products'
import { createPricingService } from './pricing'
import { createInventoryService } from './inventory'
import { createSystemTaxProvider, type TaxProvider, type TaxProviderRegistry } from './tax'
import { createShippingService } from './shipping'
import { createCartService } from './cart'
import { createManualPaymentProvider, createPaymentService, type PaymentProvider, type PaymentProviderRegistry } from './payment'
import { createCheckoutService, type CheckoutService } from './checkout'
import { createFulfillmentsService } from './fulfillments'

function taxRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return { get: <T>(_t: 'tax', id: string): T => providers[id] as unknown as T }
}
function paymentRegistry(provider: PaymentProvider): PaymentProviderRegistry {
  return { get: () => provider }
}

let db: PygmalionDatabase
let checkout: CheckoutService
let fulfillments: ReturnType<typeof createFulfillmentsService>
let orderId: string
let lineItemId: string

async function placeOrder(qty: number) {
  const providers = taxRegistry({ system: createSystemTaxProvider() })
  const pricing = createPricingService({ db })
  const shipping = createShippingService({ db, pricing, providers: { get: () => { throw new Error('no fulfillment provider') } } })
  const cart = createCartService({ db, pricing, providers, shipping })
  const payment = createPaymentService({ db, providers: paymentRegistry(createManualPaymentProvider()) })
  checkout = createCheckoutService({ db, providers: paymentRegistry(createManualPaymentProvider()), cart })
  fulfillments = createFulfillmentsService({ db })

  const currencies = createCurrenciesService({ db })
  const regions = createRegionsService({ db })
  const products = createProductsService({ db })
  const inventory = createInventoryService({ db })
  await currencies.seed()
  const regionId = (await regions.create({ name: 'NA', currencyCode: 'usd' })).id
  const product = await products.create({ title: 'Mug', status: 'published' })
  const variantId = (await products.variants.create(product.id, { title: 'Default' })).id
  await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })
  const loc = await inventory.locations.create({ name: 'Main' })
  const item = await inventory.items.create({ sku: 'MUG' })
  await inventory.items.linkVariant(variantId, { inventoryItemId: item.id })
  await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })

  const c = await cart.create({ regionId })
  await cart.addItem(c.id, { variantId, quantity: qty })
  await cart.setAddresses(c.id, { shippingAddress: { countryCode: 'US', city: 'Austin' } })
  const collection = await payment.collections.create({ cartId: c.id, amount: qty * 1000, currencyCode: 'usd' })
  await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
  const { order } = await checkout.completeCart(c.id)
  orderId = order.id
  const [line] = await db.select().from(schema.orderLineItems).where(eq(schema.orderLineItems.orderId, order.id))
  lineItemId = line.id
}

beforeEach(async () => {
  db = await createTestDb(schema)
})

describe('cancel order — active-fulfillment guard', () => {
  it('refuses to cancel an order with an active fulfillment', async () => {
    await placeOrder(2)
    await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    await expect(checkout.cancelOrder(orderId)).rejects.toThrow(/fulfillment/i)
  })

  it('allows cancel once every fulfillment is canceled', async () => {
    await placeOrder(2)
    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    await fulfillments.cancel(fulfillment.id)
    const canceled = await checkout.cancelOrder(orderId)
    expect(canceled?.status).toBe('canceled')
  })
})

describe('archive order (reversible)', () => {
  it('archives and un-archives, emitting order.archived', async () => {
    await placeOrder(1)
    const archived = await checkout.archiveOrder(orderId)
    expect(archived?.status).toBe('archived')
    const events = await db.select().from(outbox)
    expect(events.some((e) => e.event === 'order.archived')).toBe(true)

    const restored = await checkout.archiveOrder(orderId, { archived: false })
    expect(restored?.status).toBe('pending')
  })

  it('refuses to archive a canceled order', async () => {
    await placeOrder(1)
    await checkout.cancelOrder(orderId)
    await expect(checkout.archiveOrder(orderId)).rejects.toThrow(/cancel/i)
  })
})
