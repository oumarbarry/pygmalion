import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { orderTransactions } from '../schema/orders'
import { exchangeItems } from '../schema/rma'
import type { PygmalionDatabase } from '../db/types'
import { makeStack, placeOrder, reservedQty, seedCatalog, type Stack } from './order-test-fixture'

let db: PygmalionDatabase
let s: Stack
let regionId: string
let variantId: string
let outVariantId: string
let outInventoryItemId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  s = makeStack(db)
  const seed = await seedCatalog(s, { unitPrice: 1000, stock: 10, variants: 2 })
  regionId = seed.regionId
  variantId = seed.variants[0].variantId
  outVariantId = seed.variants[1].variantId
  outInventoryItemId = seed.variants[1].inventoryItemId
})

describe('exchange — create (outbound reserved, inbound return, difference computed)', () => {
  it('creates outbound order lines + reserves them, links an inbound return, and computes a positive difference', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { exchange, inboundReturnId, outboundLineItemIds } = await s.exchanges.create(orderId, {
      inbound: [{ lineItemId, quantity: 1 }],
      outbound: [{ variantId: outVariantId, title: 'Bigger', unitPrice: 2000, quantity: 2 }],
    })
    expect(exchange.id).toMatch(/^exc_/)
    expect(exchange.status).toBe('requested')
    // Outbound worth more than the single returned unit -> customer owes.
    expect(exchange.differenceDue).toBeGreaterThan(0)

    // Outbound became real, reserved order lines.
    expect(outboundLineItemIds).toHaveLength(1)
    expect(await reservedQty(db, outInventoryItemId)).toBe(2)
    const exItems = await db.select().from(exchangeItems).where(eq(exchangeItems.exchangeId, exchange.id))
    expect(exItems[0].lineItemId).toBe(outboundLineItemIds[0])

    // Inbound is a linked return (leg-entrant pattern).
    const inbound = await s.returns.get(inboundReturnId)
    expect(inbound?.exchangeId).toBe(exchange.id)
    expect(inbound?.status).toBe('requested')
  })
})

describe('exchange — complete settles the difference in BOTH directions', () => {
  it('positive difference records an append-only exchange_difference transaction', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { exchange, inboundReturnId } = await s.exchanges.create(orderId, {
      inbound: [{ lineItemId, quantity: 1 }],
      outbound: [{ variantId: outVariantId, title: 'Bigger', unitPrice: 2000, quantity: 2 }],
    })
    // Cannot complete before the inbound return is received.
    await expect(s.exchanges.complete(exchange.id)).rejects.toThrow(/received|inbound/i)

    await s.returns.receive(inboundReturnId, { items: [{ lineItemId, receivedQuantity: 1 }] })
    const completed = await s.exchanges.complete(exchange.id)
    expect(completed.status).toBe('completed')

    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))
    const diff = txns.filter((t) => t.reference === 'exchange_difference')
    expect(diff).toHaveLength(1)
    expect(diff[0].amount).toBe(exchange.differenceDue)
    expect(diff[0].amount).toBeGreaterThan(0)
  })

  it('negative difference refunds the customer via the append-only ledger (signed-negative refund)', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { exchange, inboundReturnId } = await s.exchanges.create(orderId, {
      inbound: [{ lineItemId, quantity: 2 }],
      outbound: [{ title: 'Cheaper custom', unitPrice: 100, quantity: 1 }],
    })
    expect(exchange.differenceDue).toBeLessThan(0)

    await s.returns.receive(inboundReturnId, { items: [{ lineItemId, receivedQuantity: 2 }] })
    await s.exchanges.complete(exchange.id)

    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))
    const refunds = txns.filter((t) => t.reference === 'refund')
    expect(refunds).toHaveLength(1)
    expect(refunds[0].amount).toBe(exchange.differenceDue) // e.g. -2090
  })
})

describe('exchange — cancel', () => {
  it('cancels a requested exchange, releases outbound reservations and cancels the inbound return', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { exchange, inboundReturnId } = await s.exchanges.create(orderId, {
      inbound: [{ lineItemId, quantity: 1 }],
      outbound: [{ variantId: outVariantId, title: 'Bigger', unitPrice: 2000, quantity: 2 }],
    })
    expect(await reservedQty(db, outInventoryItemId)).toBe(2)
    const canceled = await s.exchanges.cancel(exchange.id)
    expect(canceled.status).toBe('canceled')
    expect(await reservedQty(db, outInventoryItemId)).toBe(0)
    expect((await s.returns.get(inboundReturnId))?.status).toBe('canceled')
  })
})
