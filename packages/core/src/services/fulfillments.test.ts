import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { inventoryLevels, reservationItems } from '../schema/inventory'
import { fulfillments as fulfillmentsTable, orderEvents } from '../schema/orders'
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
import { createCheckoutService } from './checkout'
import { createFulfillmentsService } from './fulfillments'

function taxRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return { get: <T>(_t: 'tax', id: string): T => providers[id] as unknown as T }
}
function paymentRegistry(provider: PaymentProvider): PaymentProviderRegistry {
  return { get: () => provider }
}

let db: PygmalionDatabase
let fulfillments: ReturnType<typeof createFulfillmentsService>
let orderId: string
let lineItemId: string
let inventoryItemId: string
let locationId: string

async function stockedQty() {
  const [row] = await db.select().from(inventoryLevels).where(eq(inventoryLevels.inventoryItemId, inventoryItemId)).limit(1)
  return row?.stockedQuantity ?? 0
}
async function reservedQty() {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${reservationItems.quantity}), 0)::int` })
    .from(reservationItems)
    .where(eq(reservationItems.inventoryItemId, inventoryItemId))
  return row?.total ?? 0
}

// Place a real order of `qty` units via the checkout flow, so the fulfillment
// tests run against genuine order line items + reservations.
async function placeOrder(qty: number) {
  const providers = taxRegistry({ system: createSystemTaxProvider() })
  const pricing = createPricingService({ db })
  const shipping = createShippingService({ db, pricing, providers: { get: () => { throw new Error('no fulfillment provider') } } })
  const cart = createCartService({ db, pricing, providers, shipping })
  const payment = createPaymentService({ db, providers: paymentRegistry(createManualPaymentProvider()) })
  const checkout = createCheckoutService({ db, providers: paymentRegistry(createManualPaymentProvider()), cart })

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
  locationId = loc.id
  inventoryItemId = item.id

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
  fulfillments = createFulfillmentsService({ db })
})

describe('fulfillment — create (decrement stock + reduce reservation)', () => {
  it('creating a fulfillment for part of a line decrements stock and reduces the reservation by that amount', async () => {
    await placeOrder(5)
    expect(await stockedQty()).toBe(10)
    expect(await reservedQty()).toBe(5)

    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    expect(fulfillment.id).toMatch(/^ful_/)
    expect(fulfillment.packedAt).not.toBeNull()

    // Physical decrement + reservation reduction, exactly 2 units each.
    expect(await stockedQty()).toBe(8)
    expect(await reservedQty()).toBe(3)
    expect(await fulfillments.orderFulfillmentStatus(orderId)).toBe('partially_fulfilled')

    // order.fulfillment_created emitted in the tx.
    const events = await db.select().from(outbox)
    expect(events.some((e) => e.event === 'order.fulfillment_created')).toBe(true)
  })

  it('fulfilling the remaining units drives the derived status to fulfilled', async () => {
    await placeOrder(5)
    await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 3 }] })
    expect(await stockedQty()).toBe(5)
    expect(await reservedQty()).toBe(0)
    expect(await fulfillments.orderFulfillmentStatus(orderId)).toBe('fulfilled')
  })

  it('rejects fulfilling more than the remaining quantity of a line', async () => {
    await placeOrder(5)
    await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 4 }] })
    await expect(fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })).rejects.toThrow(/remaining|quantity/i)
  })

  it('drift guard: reservations covering less than requested is refused, tx rolled back', async () => {
    await placeOrder(2) // reserved 2, stocked 10
    // Simulate inventory drift: the reservation only covers 1 of the 2 line units.
    await db.update(reservationItems).set({ quantity: 1 }).where(eq(reservationItems.lineItemId, lineItemId))
    await expect(fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })).rejects.toThrow(/drift/i)
    // Whole tx rolled back: stock untouched, reservation still the drifted 1.
    expect(await stockedQty()).toBe(10)
    expect(await reservedQty()).toBe(1)
  })
})

describe('fulfillment — shipment + delivery state machine', () => {
  it('ship sets shipped_at + tracking and emits order.shipment_created; order status partially_shipped', async () => {
    await placeOrder(4)
    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    const shipped = await fulfillments.ship(fulfillment.id, { trackingNumber: '1Z999' })
    expect(shipped.shippedAt).not.toBeNull()
    const full = await fulfillments.get(fulfillment.id)
    expect(full?.labels.some((l) => l.trackingNumber === '1Z999')).toBe(true)
    expect(await fulfillments.orderFulfillmentStatus(orderId)).toBe('partially_shipped')
    const events = await db.select().from(outbox)
    expect(events.some((e) => e.event === 'order.shipment_created')).toBe(true)
  })

  it('deliver requires a shipped fulfillment; delivering before shipping is rejected', async () => {
    await placeOrder(2)
    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    await expect(fulfillments.deliver(fulfillment.id)).rejects.toThrow(/ship/i)
    await fulfillments.ship(fulfillment.id, {})
    const delivered = await fulfillments.deliver(fulfillment.id)
    expect(delivered.deliveredAt).not.toBeNull()
    expect(await fulfillments.orderFulfillmentStatus(orderId)).toBe('delivered')
  })

  it('double-ship is rejected — exactly one shipment_created event (conditional claim)', async () => {
    await placeOrder(2)
    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    await fulfillments.ship(fulfillment.id, {})
    await expect(fulfillments.ship(fulfillment.id, {})).rejects.toThrow(/already shipped/i)
    const shipEvents = (await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId))).filter((e) => e.type === 'order.shipment_created')
    expect(shipEvents).toHaveLength(1)
    const outboxShip = (await db.select().from(outbox)).filter((e) => e.event === 'order.shipment_created')
    expect(outboxShip).toHaveLength(1)
  })
})

describe('fulfillment — cancel (restore stock + recreate reservation)', () => {
  it('canceling a packed fulfillment re-increments stock and recreates the reservation', async () => {
    await placeOrder(5)
    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    expect(await stockedQty()).toBe(8)
    expect(await reservedQty()).toBe(3)

    const canceled = await fulfillments.cancel(fulfillment.id)
    expect(canceled.canceledAt).not.toBeNull()
    // Capital assertion: stock restored, reservation back to the full 5.
    expect(await stockedQty()).toBe(10)
    expect(await reservedQty()).toBe(5)
    expect(await fulfillments.orderFulfillmentStatus(orderId)).toBe('not_fulfilled')
    const events = await db.select().from(outbox)
    expect(events.some((e) => e.event === 'order.fulfillment_canceled')).toBe(true)
  })

  it('refuses to cancel a shipped fulfillment', async () => {
    await placeOrder(2)
    const { fulfillment } = await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 2 }] })
    await fulfillments.ship(fulfillment.id, {})
    await expect(fulfillments.cancel(fulfillment.id)).rejects.toThrow(/shipped|delivered/i)
    // Stock untouched by the refused cancel.
    expect(await stockedQty()).toBe(8)
  })
})
