import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { carts } from '../schema/cart'
import { reservationItems } from '../schema/inventory'
import { orderEvents, orderTransactions } from '../schema/orders'
import { outbox } from '../schema/outbox'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { createProductsService } from './products'
import { createPricingService } from './pricing'
import { createInventoryService } from './inventory'
import { createSystemTaxProvider, type TaxProvider, type TaxProviderRegistry } from './tax'
import { createShippingService } from './shipping'
import { createCartService, type CartService } from './cart'
import { createManualPaymentProvider, createPaymentService, type PaymentProvider, type PaymentProviderRegistry } from './payment'
import { createCheckoutService } from './checkout'

function taxRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return { get: <T>(_t: 'tax', id: string): T => providers[id] as unknown as T }
}
function paymentRegistry(provider: PaymentProvider): PaymentProviderRegistry {
  return { get: () => provider }
}

let db: PygmalionDatabase
let cart: CartService
let payment: ReturnType<typeof createPaymentService>
let inventory: ReturnType<typeof createInventoryService>
let regionId: string
let variantId: string

async function reservedTotal(variantId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${reservationItems.quantity}), 0)::int` })
    .from(reservationItems)
  return row?.total ?? 0
}

async function buildCheckout(provider: PaymentProvider = createManualPaymentProvider()) {
  const providers = taxRegistry({ system: createSystemTaxProvider() })
  const pricing = createPricingService({ db })
  const shipping = createShippingService({ db, pricing, providers: { get: () => { throw new Error('no fulfillment provider') } } })
  cart = createCartService({ db, pricing, providers, shipping })
  payment = createPaymentService({ db, providers: paymentRegistry(provider) })
  return createCheckoutService({ db, providers: paymentRegistry(provider), cart })
}

// Full setup: region + priced variant + stock + a cart ready to check out + a
// payment collection/session on it.
async function seedReadyCart() {
  const currencies = createCurrenciesService({ db })
  const regions = createRegionsService({ db })
  const products = createProductsService({ db })
  const pricing = createPricingService({ db })
  inventory = createInventoryService({ db })
  await currencies.seed()
  regionId = (await regions.create({ name: 'NA', currencyCode: 'usd' })).id
  const product = await products.create({ title: 'Mug', status: 'published' })
  variantId = (await products.variants.create(product.id, { title: 'Default' })).id
  await pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: 1000 }] })

  // Stock: a location with 10 units so the reservation succeeds.
  const loc = await inventory.locations.create({ name: 'Main' })
  const item = await inventory.items.create({ sku: 'MUG' })
  await inventory.items.linkVariant(variantId, { inventoryItemId: item.id })
  await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })

  const c = await cart.create({ regionId })
  await cart.addItem(c.id, { variantId, quantity: 2 })
  await cart.setAddresses(c.id, { shippingAddress: { countryCode: 'US', city: 'Austin' } })

  const collection = await payment.collections.create({ cartId: c.id, amount: 2000, currencyCode: 'usd' })
  const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
  return { cartId: c.id, collectionId: collection.id, sessionId: session.id }
}

describe('checkout — complete cart', () => {
  beforeEach(async () => {
    db = await createTestDb(schema)
  })

  it('success: TX1 reserves + creates order pending, authorize succeeds, TX2 confirms + order.placed', async () => {
    const checkout = await buildCheckout()
    const { cartId } = await seedReadyCart()

    const res = await checkout.completeCart(cartId)
    expect(res.status).toBe('authorized')
    expect(res.order.id).toMatch(/^ord_/)
    expect(res.order.total).toBe(2000)

    // Stock reserved (2 units), cart marked complete, order.placed on the outbox.
    expect(await reservedTotal(variantId)).toBe(2)
    const [c] = await db.select().from(schema.carts).where(eq(schema.carts.id, cartId))
    expect(c.completedAt).not.toBeNull()
    const events = await db.select().from(outbox)
    expect(events.some((e) => e.event === 'order.placed')).toBe(true)
  })

  it('failure: authorize fails -> TX2’ cancels the order and releases the reserved stock', async () => {
    const failing: PaymentProvider = { ...createManualPaymentProvider(), async authorize() { return { data: {}, status: 'error' } } }
    const checkout = await buildCheckout(failing)
    const { cartId } = await seedReadyCart()

    const res = await checkout.completeCart(cartId)
    expect(res.status).toBe('error')
    expect(res.order.status).toBe('canceled')
    // Capital assertion: the reserved stock is freed.
    expect(await reservedTotal(variantId)).toBe(0)
  })

  it('idempotent replay: completing an already-completed cart returns the same order, no double reserve/authorize', async () => {
    let authorizeCalls = 0
    const counting: PaymentProvider = {
      ...createManualPaymentProvider(),
      async authorize(d) {
        authorizeCalls++
        return { data: { ...d, authorized: true }, status: 'authorized' }
      },
    }
    const checkout = await buildCheckout(counting)
    const { cartId } = await seedReadyCart()

    const first = await checkout.completeCart(cartId)
    const second = await checkout.completeCart(cartId)
    expect(second.order.id).toBe(first.order.id)
    expect(second.status).toBe('already_complete')
    expect(authorizeCalls).toBe(1)
    expect(await reservedTotal(variantId)).toBe(2) // not 4
  })

  it('deferred capture + partial refund record append-only order_transactions', async () => {
    const checkout = await buildCheckout()
    const { cartId } = await seedReadyCart()
    const { order } = await checkout.completeCart(cartId)

    // Capture at "shipment" (deferred), then a partial refund.
    await checkout.captureOrder(order.id, {})
    await checkout.refundOrder(order.id, { amount: 500 })

    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, order.id))
    const captured = txns.filter((t) => t.reference === 'capture').reduce((a, t) => a + t.amount, 0)
    const refunded = txns.filter((t) => t.reference === 'refund').reduce((a, t) => a + t.amount, 0)
    expect(captured).toBe(2000)
    expect(refunded).toBe(-500)
  })
})

describe('checkout — hardening (concurrency, amount coherence, guards)', () => {
  beforeEach(async () => {
    db = await createTestDb(schema)
  })

  it('a frozen cart with no order yet -> 409-style "completion already in progress"', async () => {
    const checkout = await buildCheckout()
    const { cartId } = await seedReadyCart()
    // Simulate a concurrent winner: the cart is frozen but its order is not yet
    // visible. Exercises the TX1 0-row freeze path directly (real concurrency
    // isn't observable under single-connection PGlite).
    await db.update(carts).set({ completedAt: new Date() }).where(eq(carts.id, cartId))
    await expect(checkout.completeCart(cartId)).rejects.toThrow(/in progress/)
  })

  it('rejects completion when the payment collection amount is out of date with the cart total', async () => {
    const checkout = await buildCheckout()
    const { cartId } = await seedReadyCart() // collection.amount = 2000
    // Total changes after the collection was created (extra unit) -> mismatch.
    await cart.addItem(cartId, { variantId, quantity: 1 })
    await expect(checkout.completeCart(cartId)).rejects.toThrow(/out of date/)
  })

  it('over-capture / over-refund are rejected BEFORE the external provider call', async () => {
    let captureCalls = 0
    let refundCalls = 0
    const spy: PaymentProvider = {
      ...createManualPaymentProvider(),
      async capture(d, a) { captureCalls++; return { data: d, status: 'captured' } },
      async refund(d) { refundCalls++; return { data: d, status: 'authorized' } },
    }
    const checkout = await buildCheckout(spy)
    const { cartId } = await seedReadyCart()
    const { order } = await checkout.completeCart(cartId) // authorized amount 2000

    await expect(checkout.captureOrder(order.id, { amount: 3000 })).rejects.toThrow()
    expect(captureCalls).toBe(0) // provider never called
    await expect(checkout.refundOrder(order.id, { amount: 100 })).rejects.toThrow() // nothing captured
    expect(refundCalls).toBe(0)
  })

  it('cancel is refused while captured funds are not fully refunded', async () => {
    const checkout = await buildCheckout()
    const { cartId } = await seedReadyCart()
    const { order } = await checkout.completeCart(cartId)
    await checkout.captureOrder(order.id, {}) // capture 2000
    await expect(checkout.cancelOrder(order.id)).rejects.toThrow(/refund first/)
  })

  it('capture after cancel is refused (payment marked canceled), and the hold void is logged', async () => {
    const checkout = await buildCheckout()
    const { cartId } = await seedReadyCart()
    const { order } = await checkout.completeCart(cartId)
    await checkout.cancelOrder(order.id) // nothing captured -> allowed
    await expect(checkout.captureOrder(order.id, {})).rejects.toThrow()
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id))
    expect(events.some((e) => e.type === 'payment.hold_voided')).toBe(true)
  })

  it('a refused authorize unfreezes the cart; a retry with a fresh session succeeds on the SAME cart (Medusa v2 parity)', async () => {
    const failing: PaymentProvider = { ...createManualPaymentProvider(), async authorize() { return { data: {}, status: 'error' } } }
    const failingCheckout = await buildCheckout(failing)
    const { cartId } = await seedReadyCart() // no tax in unit setup -> total 2000
    const failed = await failingCheckout.completeCart(cartId)
    expect(failed.status).toBe('error')
    expect(await reservedTotal(variantId)).toBe(0) // released

    const [afterFail] = await db.select().from(carts).where(eq(carts.id, cartId))
    expect(afterFail.completedAt).toBeNull() // cart is reusable again

    // Retry: recreate a payment collection + session, complete with a provider
    // that authorizes.
    const okCheckout = await buildCheckout()
    const total = afterFail.total
    const collection = await payment.collections.create({ cartId, amount: total, currencyCode: 'usd' })
    await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    const ok = await okCheckout.completeCart(cartId)
    expect(ok.status).toBe('authorized')
    expect(ok.order.id).not.toBe(failed.order.id) // a NEW order
    expect(await reservedTotal(variantId)).toBe(2) // reserved exactly once

    // Idempotent replay after the retry returns the NEW order, never the canceled one.
    const replay = await okCheckout.completeCart(cartId)
    expect(replay.status).toBe('already_complete')
    expect(replay.order.id).toBe(ok.order.id)
  })
})
