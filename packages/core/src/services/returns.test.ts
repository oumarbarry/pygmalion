import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { orderTransactions } from '../schema/orders'
import { returnItems, returns as returnsTable } from '../schema/rma'
import { outbox } from '../schema/outbox'
import type { PygmalionDatabase } from '../db/types'
import { makeStack, placeOrder, seedCatalog, stockedQty, type Stack } from './order-test-fixture'

let db: PygmalionDatabase
let s: Stack
let regionId: string
let variantId: string
let inventoryItemId: string
let locationId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  s = makeStack(db)
  const seed = await seedCatalog(s, { unitPrice: 1000, stock: 10 })
  regionId = seed.regionId
  locationId = seed.locationId
  variantId = seed.variants[0].variantId
  inventoryItemId = seed.variants[0].inventoryItemId
})

describe('return reasons (admin CRUD referential)', () => {
  it('creates, lists, updates and soft-deletes a return reason', async () => {
    const created = await s.returns.reasons.create({ value: 'wrong_size', label: 'Wrong size' })
    expect(created.id).toMatch(/^rr_/)
    const listed = await s.returns.reasons.list()
    expect(listed.map((r) => r.id)).toContain(created.id)
    const updated = await s.returns.reasons.update(created.id, { label: 'Size mismatch' })
    expect(updated?.label).toBe('Size mismatch')
    await s.returns.reasons.remove(created.id)
    expect((await s.returns.reasons.list()).map((r) => r.id)).not.toContain(created.id)
  })
})

describe('return — request (shipped lines only)', () => {
  it('rejects requesting a return on a line that was never shipped', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 3, { capture: true })
    await expect(s.returns.request(orderId, { items: [{ lineItemId, quantity: 1 }] })).rejects.toThrow(/ship/i)
  })

  it('creates a requested return for shipped units and rejects over-requesting', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 3, { capture: true, ship: true })
    const ret = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 2 }] })
    expect(ret.id).toMatch(/^ret_/)
    expect(ret.status).toBe('requested')
    // Σ requested (2) + 2 more = 4 > 3 shipped -> rejected.
    await expect(s.returns.request(orderId, { items: [{ lineItemId, quantity: 2 }] })).rejects.toThrow(/exceed|shipped|remaining/i)
  })
})

describe('return — receive (re-increments stock, partial possible)', () => {
  it('receiving units re-increments stock by the received quantity and marks received', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 3, { capture: true, ship: true })
    // After ship: stock decremented from 10 to 7.
    expect(await stockedQty(db, inventoryItemId)).toBe(7)
    const ret = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 2 }] })

    // Partial receive of 1 -> partially_received, stock 7 -> 8.
    const partial = await s.returns.receive(ret.id, { items: [{ lineItemId, receivedQuantity: 1 }] })
    expect(partial.status).toBe('partially_received')
    expect(await stockedQty(db, inventoryItemId)).toBe(8)

    // Receive the last 1 -> received, stock 8 -> 9.
    const full = await s.returns.receive(ret.id, { items: [{ lineItemId, receivedQuantity: 1 }] })
    expect(full.status).toBe('received')
    expect(await stockedQty(db, inventoryItemId)).toBe(9)

    const events = await db.select().from(outbox)
    expect(events.some((e) => e.event === 'order.return_received')).toBe(true)
  })

  it('does not re-increment stock for damaged units', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    expect(await stockedQty(db, inventoryItemId)).toBe(8)
    const ret = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 2 }] })
    const full = await s.returns.receive(ret.id, { items: [{ lineItemId, receivedQuantity: 2, damagedQuantity: 1 }] })
    expect(full.status).toBe('received')
    // Only 1 of the 2 received units was resellable -> stock 8 -> 9, not 10.
    expect(await stockedQty(db, inventoryItemId)).toBe(9)
  })

  it('rejects receiving before requesting and receiving more than requested', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 3, { capture: true, ship: true })
    await expect(s.returns.receive('ret_nope', { items: [{ lineItemId, receivedQuantity: 1 }] })).rejects.toThrow(/not found/i)
    const ret = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 1 }] })
    await expect(s.returns.receive(ret.id, { items: [{ lineItemId, receivedQuantity: 2 }] })).rejects.toThrow(/exceed|requested/i)
  })
})

describe('return: refund on full receipt through the ledger', () => {
  it('records a signed-negative append-only order_transaction when the return carries a refund amount', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const ret = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 2 }], refundAmount: 1000 })
    await s.returns.receive(ret.id, { items: [{ lineItemId, receivedQuantity: 2 }] })
    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))
    const refunds = txns.filter((t) => t.reference === 'refund')
    expect(refunds).toHaveLength(1)
    expect(refunds[0].amount).toBe(-1000)
  })
})

describe('return — cancel', () => {
  it('cancels a not-yet-received return and refuses to cancel a partially-received one', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 3, { capture: true, ship: true })
    const a = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 3 }] })
    const canceled = await s.returns.cancel(a.id)
    expect(canceled.status).toBe('canceled')

    const b = await s.returns.request(orderId, { items: [{ lineItemId, quantity: 3 }] })
    await s.returns.receive(b.id, { items: [{ lineItemId, receivedQuantity: 1 }] })
    await expect(s.returns.cancel(b.id)).rejects.toThrow(/received/i)
  })
})
