import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { orderTransactions } from '../schema/orders'
import { captures, paymentCollections, payments } from '../schema/payment'
import type { PygmalionDatabase } from '../db/types'
import { makeStack, placeOrder, seedCatalog, type Stack } from './order-test-fixture'

// An order edit that RAISES the total, and a positive exchange difference,
// must become COLLECTABLE. Both open an
// additional payment collection on the order; the derived payment status
// aggregates every collection of the order.

let db: PygmalionDatabase
let s: Stack
let regionId: string
let variantId: string
let outVariantId: string

async function collectionsOf(orderId: string) {
  return db.select().from(paymentCollections).where(eq(paymentCollections.orderId, orderId)).orderBy(asc(paymentCollections.createdAt))
}

beforeEach(async () => {
  db = await createTestDb(schema)
  s = makeStack(db)
  const seed = await seedCatalog(s, { unitPrice: 1000, stock: 10, variants: 2 })
  regionId = seed.regionId
  variantId = seed.variants[0].variantId
  outVariantId = seed.variants[1].variantId
})

describe('order edit — additional payment collection', () => {
  it('opens an additional collection for the delta when the confirmed edit raises the total', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true })
    const before = (await s.checkout.getOrder(orderId))!
    const edit = await s.orderEdits.request(orderId, {
      additions: [{ variantId, title: 'Extra mug', unitPrice: 1000, quantity: 1 }],
    })
    const after = await s.orderEdits.confirm(edit.id)
    expect(after.total).toBeGreaterThan(before.total)

    const cols = await collectionsOf(orderId)
    expect(cols).toHaveLength(2)
    expect(cols[1].amount).toBe(after.total - before.total)
    expect(cols[1].status).toBe('not_paid')
    expect(cols[1].cartId).toBeNull()
  })

  it('opens NO additional collection when the edit lowers or keeps the total', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 3, { capture: true })
    const edit = await s.orderEdits.request(orderId, { updates: [{ lineItemId, quantity: 1 }] })
    await s.orderEdits.confirm(edit.id)
    expect(await collectionsOf(orderId)).toHaveLength(1)
  })
})

describe('markAsPaid — manual capture of an additional collection', () => {
  it('authorizes + captures the collection and drives the order to a fully captured status', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true })
    const edit = await s.orderEdits.request(orderId, {
      additions: [{ variantId, title: 'Extra mug', unitPrice: 1000, quantity: 1 }],
    })
    await s.orderEdits.confirm(edit.id)

    // The edit is unpaid: captured < the new total.
    const pending = (await s.checkout.getOrder(orderId))!
    expect(pending.paymentStatus).toBe('partially_captured')

    const [, additional] = await collectionsOf(orderId)
    const paid = await s.payment.collections.markAsPaid(additional.id, { providerId: 'manual', createdBy: 'staff_1' })
    expect(paid.status).toBe('captured')
    expect(paid.capturedAmount).toBe(additional.amount)

    const order = (await s.checkout.getOrder(orderId))!
    expect(order.paymentStatus).toBe('captured')
    // Append-only ledger: the manual capture is traced on the order too.
    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))
    expect(txns.filter((t) => t.reference === 'capture').reduce((a, t) => a + t.amount, 0)).toBe(order.total)
  })

  it('is single-shot: a concurrent/second mark-as-paid is refused and captures nothing twice', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true })
    const edit = await s.orderEdits.request(orderId, {
      additions: [{ variantId, title: 'Extra mug', unitPrice: 1000, quantity: 1 }],
    })
    await s.orderEdits.confirm(edit.id)
    const [, additional] = await collectionsOf(orderId)

    const results = await Promise.allSettled([
      s.payment.collections.markAsPaid(additional.id, {}),
      s.payment.collections.markAsPaid(additional.id, {}),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    const rows = await db.select().from(payments).where(eq(payments.paymentCollectionId, additional.id))
    expect(rows).toHaveLength(1)
    const caps = await db.select().from(captures).where(eq(captures.paymentId, rows[0].id))
    expect(caps.reduce((a, c) => a + c.amount, 0)).toBe(additional.amount)
  })
})

describe('createForOrder — outstanding amount guard', () => {
  it('refuses a collection for a draft already marked paid manually (ledger-only payment)', async () => {
    const draft = await s.draftOrders.create({
      email: 'markpaid@test.dev',
      regionId,
      currencyCode: 'usd',
      items: [{ variantId, title: 'Mug', unitPrice: 1000, quantity: 2 }],
    })
    await s.draftOrders.complete(draft.id, { markPaid: true })
    // The manual payment lives ONLY on the order_transactions ledger — the
    // outstanding computation must see it, or this order gets collected twice.
    await expect(s.payment.collections.createForOrder({ orderId: draft.id })).rejects.toThrow(/outstanding/)
    // And the derived payment status folds it in (not 'awaiting').
    const order = (await s.checkout.getOrder(draft.id))!
    expect(order.capturedAmount).toBe(draft.total)
    expect(order.paymentStatus).toBe('captured')
  })

  it('refuses a manual collection for a debt an OPEN collection already covers', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true })
    const edit = await s.orderEdits.request(orderId, {
      additions: [{ variantId, title: 'Extra mug', unitPrice: 1000, quantity: 1 }],
    })
    await s.orderEdits.confirm(edit.id)
    // The edit already opened a collection for the whole delta.
    await expect(s.payment.collections.createForOrder({ orderId })).rejects.toThrow(/outstanding/)
  })

  it('opens a collection for the full total of an order that has none (converted draft)', async () => {
    const draft = await s.draftOrders.create({
      email: 'draft@test.dev',
      regionId,
      currencyCode: 'usd',
      items: [{ variantId, title: 'Mug', unitPrice: 1000, quantity: 2 }],
    })
    await s.draftOrders.complete(draft.id)
    const collection = await s.payment.collections.createForOrder({ orderId: draft.id })
    expect(collection.amount).toBe(draft.total)
    const paid = await s.payment.collections.markAsPaid(collection.id, {})
    expect(paid.status).toBe('captured')
    expect((await s.checkout.getOrder(draft.id))!.paymentStatus).toBe('captured')
  })
})

describe('order-wide money guards with several collections', () => {
  it('refuses to cancel an order whose ADDITIONAL collection holds captured funds', async () => {
    // First collection authorized only (no capture) — the refund-first guard
    // must still see the captured funds of the second collection.
    const { orderId } = await placeOrder(s, { regionId, variantId }, 2)
    const edit = await s.orderEdits.request(orderId, {
      additions: [{ variantId, title: 'Extra mug', unitPrice: 1000, quantity: 1 }],
    })
    await s.orderEdits.confirm(edit.id)
    const [, additional] = await collectionsOf(orderId)
    await s.payment.collections.markAsPaid(additional.id, {})

    await expect(s.checkout.cancelOrder(orderId)).rejects.toThrow(/captured/)
  })
})

describe('exchange difference — additional payment collection', () => {
  it('opens an additional collection for a positive difference at complete', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { exchange, inboundReturnId } = await s.exchanges.create(orderId, {
      inbound: [{ lineItemId, quantity: 1 }],
      outbound: [{ variantId: outVariantId, title: 'Bigger', unitPrice: 2000, quantity: 1 }],
    })
    expect(exchange.differenceDue!).toBeGreaterThan(0)
    await s.returns.receive(inboundReturnId, { items: [{ lineItemId, receivedQuantity: 1 }] })
    await s.exchanges.complete(exchange.id)

    const cols = await collectionsOf(orderId)
    expect(cols).toHaveLength(2)
    expect(cols[1].amount).toBe(exchange.differenceDue)
    // The signal transaction stays (audit trail), the collection makes it payable.
    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))
    expect(txns.some((t) => t.reference === 'exchange_difference')).toBe(true)
  })
})
