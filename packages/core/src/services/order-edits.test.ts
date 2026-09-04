import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { reservationItems } from '../schema/inventory'
import { orderEvents, orderLineItems, orders } from '../schema/orders'
import { outbox } from '../schema/outbox'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { createProductsService } from './products'
import { createPricingService } from './pricing'
import { createInventoryService } from './inventory'
import { createSystemTaxProvider, createTaxService, type TaxProvider, type TaxProviderRegistry } from './tax'
import { createTaxRegionsService } from './tax'
import { createTaxRatesService } from './tax'
import { createShippingService } from './shipping'
import { createCartService } from './cart'
import { createManualPaymentProvider, createPaymentService, type PaymentProvider, type PaymentProviderRegistry } from './payment'
import { createCheckoutService } from './checkout'
import { createFulfillmentsService } from './fulfillments'
import { createOrderEditsService } from './order-edits'

function taxRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return { get: <T>(_t: 'tax', id: string): T => providers[id] as unknown as T }
}
function paymentRegistry(provider: PaymentProvider): PaymentProviderRegistry {
  return { get: () => provider }
}

let db: PygmalionDatabase
let orderEdits: ReturnType<typeof createOrderEditsService>
let fulfillments: ReturnType<typeof createFulfillmentsService>
let orderId: string
let lineItemId: string
let variantId: string
let inventoryItemId: string

async function reservedQty() {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${reservationItems.quantity}), 0)::int` })
    .from(reservationItems)
    .where(eq(reservationItems.inventoryItemId, inventoryItemId))
  return row?.total ?? 0
}
async function orderRow() {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  return row
}

// Place a real order of `qty` units @ 1000. With `{ taxRate }` a US default tax
// rate is seeded first (so the shipping address's region is taxed).
async function placeOrder(qty: number, opts: { taxRate?: number } = {}) {
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
  if (opts.taxRate) {
    const taxRegions = createTaxRegionsService({ db, providers })
    const taxRates = createTaxRatesService({ db })
    const tr = await taxRegions.create({ countryCode: 'US' })
    await taxRates.create({ taxRegionId: tr.id, code: 'STD', name: 'Standard', rate: opts.taxRate, isDefault: true })
  }
  const product = await products.create({ title: 'Mug', status: 'published' })
  variantId = (await products.variants.create(product.id, { title: 'Default' })).id
  await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })

  const loc = await inventory.locations.create({ name: 'Main' })
  const item = await inventory.items.create({ sku: 'MUG' })
  await inventory.items.linkVariant(variantId, { inventoryItemId: item.id })
  await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 20 })
  inventoryItemId = item.id

  const c = await cart.create({ regionId })
  await cart.addItem(c.id, { variantId, quantity: qty })
  await cart.setAddresses(c.id, { shippingAddress: { countryCode: 'US', city: 'Austin' } })
  const [cartRow] = await db.select({ total: schema.carts.total }).from(schema.carts).where(eq(schema.carts.id, c.id))
  const collection = await payment.collections.create({ cartId: c.id, amount: cartRow.total, currencyCode: 'usd' })
  await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
  const { order } = await checkout.completeCart(c.id)
  orderId = order.id
  const [line] = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, order.id))
  lineItemId = line.id
}

beforeEach(async () => {
  db = await createTestDb(schema)
  const tax = createTaxService({ db, providers: taxRegistry({ system: createSystemTaxProvider() }) })
  orderEdits = createOrderEditsService({ db, tax })
  fulfillments = createFulfillmentsService({ db })
})

describe('order edit — request + preview (preview is in-memory, zero writes)', () => {
  it('preview projects the new totals WITHOUT writing to the order or its reservations', async () => {
    await placeOrder(3) // subtotal 3000, total 3000, reserved 3
    const edit = await orderEdits.request(orderId, {
      updates: [{ lineItemId, quantity: 5 }],
      additions: [{ variantId: null, title: 'Gift wrap', unitPrice: 500, quantity: 2 }],
    })
    expect(edit.status).toBe('requested')

    const preview = await orderEdits.preview(edit.id)
    expect(preview.itemsSubtotal).toBe(6000) // 5*1000 + 2*500
    expect(preview.total).toBe(6000)

    // ZERO writes: the persisted order + reservations are untouched pre-confirm.
    expect((await orderRow()).total).toBe(3000)
    expect(await reservedQty()).toBe(3)
    const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
    expect(lines).toHaveLength(1)
  })

  it('rejects a second active edit while one is still requested', async () => {
    await placeOrder(2)
    await orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 3 }] })
    await expect(orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 4 }] })).rejects.toThrow(/active|requested/i)
  })
})

describe('order edit — confirm (adjusts totals AND reservations, one tx)', () => {
  it('confirm applies the deltas: order totals recomputed, reservation adjusted, order_event before/after, order.updated', async () => {
    await placeOrder(3)
    const edit = await orderEdits.request(orderId, {
      updates: [{ lineItemId, quantity: 5 }],
      additions: [{ variantId: null, title: 'Gift wrap', unitPrice: 500, quantity: 2 }],
    })
    const order = await orderEdits.confirm(edit.id)

    // Totals persisted.
    expect(order.itemsSubtotal).toBe(6000)
    expect(order.total).toBe(6000)
    // Reservation adjusted from 3 -> 5 (the +2 units of the updated line).
    expect(await reservedQty()).toBe(5)
    // The custom (variantId=null) addition reserves nothing.
    const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
    expect(lines).toHaveLength(2)

    // order_event records before/after amounts.
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId))
    const edited = events.find((e) => e.type === 'order.edited')
    expect(edited?.payload).toMatchObject({ totalBefore: 3000, totalAfter: 6000 })

    // outbox order.updated + edit marked confirmed.
    const outboxRows = await db.select().from(outbox)
    expect(outboxRows.some((e) => e.event === 'order.updated')).toBe(true)
    expect((await orderEdits.get(edit.id))?.status).toBe('confirmed')
  })

  it('removing a line releases its reservation and drops it from the totals', async () => {
    await placeOrder(4) // total 4000, reserved 4
    const edit = await orderEdits.request(orderId, { removals: [lineItemId] })
    const order = await orderEdits.confirm(edit.id)
    expect(order.itemsSubtotal).toBe(0)
    expect(order.total).toBe(0)
    expect(await reservedQty()).toBe(0)
  })

  it('a confirmed edit cannot be confirmed again', async () => {
    await placeOrder(2)
    const edit = await orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 3 }] })
    await orderEdits.confirm(edit.id)
    await expect(orderEdits.confirm(edit.id)).rejects.toThrow(/requested|confirmed|status/i)
  })

  it('double-confirm applies the deltas exactly once (conditional claim)', async () => {
    await placeOrder(3) // total 3000, reserved 3
    const edit = await orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 5 }] })
    const first = await orderEdits.confirm(edit.id)
    expect(first.total).toBe(5000)
    // Second confirm is rejected by the conditional claim — no re-application.
    await expect(orderEdits.confirm(edit.id)).rejects.toThrow(/requested|confirmed|concurrent/i)
    expect((await orderRow()).total).toBe(5000) // still once, not 7000
    expect(await reservedQty()).toBe(5) // reservation not doubled
  })

  it('an added line carries the region tax', async () => {
    await placeOrder(2, { taxRate: 10 }) // US default 10% seeded
    // Add a custom line of 1000 (2 × 500) — expect 10% tax = 100.
    const edit = await orderEdits.request(orderId, {
      additions: [{ variantId: null, title: 'Engraving', unitPrice: 500, quantity: 2 }],
    })
    const preview = await orderEdits.preview(edit.id)
    expect(preview.taxTotal).toBeGreaterThanOrEqual(100) // includes the existing line's tax + the added 100
    await orderEdits.confirm(edit.id)
    const added = (await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId))).find((l) => l.title === 'Engraving')!
    expect(added.subtotal).toBe(1000)
    expect(added.taxTotal).toBe(100) // chiffré: 10% of 1000
    expect(added.total).toBe(1100)
  })
})

describe('order edit — guards', () => {
  it('cannot modify a line that already has fulfilled quantity', async () => {
    await placeOrder(3)
    await fulfillments.create(orderId, { items: [{ lineItemId, quantity: 1 }] })
    await expect(orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 5 }] })).rejects.toThrow(/fulfilled/i)
  })

  it('cancel marks the edit canceled and leaves the order untouched', async () => {
    await placeOrder(3)
    const edit = await orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 9 }] })
    const canceled = await orderEdits.cancel(edit.id)
    expect(canceled.status).toBe('canceled')
    expect((await orderRow()).total).toBe(3000)
    expect(await reservedQty()).toBe(3)
  })
})
