import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { orderTransactions } from '../schema/orders'
import { claimItems } from '../schema/rma'
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

describe('claim — replace (outbound reserved, flagged items with reason + images)', () => {
  it('creates a replace claim: flags the faulty item, reserves the replacement outbound line', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { claim, outboundLineItemIds } = await s.claims.create(orderId, {
      type: 'replace',
      items: [{ lineItemId, reason: 'production_failure', quantity: 1, images: ['https://img/1.jpg'] }],
      outbound: [{ variantId: outVariantId, title: 'Replacement', unitPrice: 1000, quantity: 1 }],
    })
    expect(claim.id).toMatch(/^clm_/)
    expect(claim.type).toBe('replace')
    expect(claim.status).toBe('requested')
    expect(outboundLineItemIds).toHaveLength(1)
    expect(await reservedQty(db, outInventoryItemId)).toBe(1)

    const items = await db.select().from(claimItems).where(eq(claimItems.claimId, claim.id))
    expect(items[0].reason).toBe('production_failure')
    expect(items[0].images).toEqual(['https://img/1.jpg'])
  })

  it('replace with an inbound leg cannot complete until the inbound return is received', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { claim, inboundReturnId } = await s.claims.create(orderId, {
      type: 'replace',
      items: [{ lineItemId, reason: 'wrong_item', quantity: 1 }],
      outbound: [{ variantId: outVariantId, title: 'Replacement', unitPrice: 1000, quantity: 1 }],
      inbound: [{ lineItemId, quantity: 1 }],
    })
    expect(inboundReturnId).toBeTruthy()
    await expect(s.claims.complete(claim.id)).rejects.toThrow(/received|inbound/i)
    await s.returns.receive(inboundReturnId!, { items: [{ lineItemId, receivedQuantity: 1 }] })
    const completed = await s.claims.complete(claim.id)
    expect(completed.status).toBe('completed')
  })
})

describe('claim — refund (append-only ledger, no double refund)', () => {
  it('completing a refund claim records a signed-negative refund; completing twice is rejected', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { claim } = await s.claims.create(orderId, {
      type: 'refund',
      items: [{ lineItemId, reason: 'missing_item', quantity: 1 }],
      refundAmount: 500,
    })
    await s.claims.complete(claim.id)
    const refunds = (await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))).filter((t) => t.reference === 'refund')
    expect(refunds).toHaveLength(1)
    expect(refunds[0].amount).toBe(-500)

    // Second complete is refused — no double refund.
    await expect(s.claims.complete(claim.id)).rejects.toThrow(/completed|canceled/i)
    const stillOne = (await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId))).filter((t) => t.reference === 'refund')
    expect(stillOne).toHaveLength(1)
  })
})

describe('claim — cancel', () => {
  it('cancels a requested replace claim and releases the outbound reservation', async () => {
    const { orderId, lineItemId } = await placeOrder(s, { regionId, variantId }, 2, { capture: true, ship: true })
    const { claim } = await s.claims.create(orderId, {
      type: 'replace',
      items: [{ lineItemId, reason: 'other', quantity: 1 }],
      outbound: [{ variantId: outVariantId, title: 'Replacement', unitPrice: 1000, quantity: 1 }],
    })
    expect(await reservedQty(db, outInventoryItemId)).toBe(1)
    const canceled = await s.claims.cancel(claim.id)
    expect(canceled.status).toBe('canceled')
    expect(await reservedQty(db, outInventoryItemId)).toBe(0)
  })
})
