import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { orderLineItems, orderTransactions, orders } from '../schema/orders'
import type { PygmalionDatabase } from '../db/types'
import { makeStack, placeOrder, reservedQty, seedCatalog, type Stack } from './order-test-fixture'

let db: PygmalionDatabase
let s: Stack
let regionId: string
let variantId: string
let inventoryItemId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  s = makeStack(db)
  const seed = await seedCatalog(s, { unitPrice: 1000, stock: 10 })
  regionId = seed.regionId
  variantId = seed.variants[0].variantId
  inventoryItemId = seed.variants[0].inventoryItemId
})

async function makeDraft() {
  return s.draftOrders.create({
    regionId,
    currencyCode: 'usd',
    email: 'buyer@shop.test',
    items: [
      { variantId, quantity: 1 }, // catalogue line, price from the pricing service
      { title: 'Gift wrap', unitPrice: 500, quantity: 1 }, // custom line
    ],
    shippingAddress: { countryCode: 'US', city: 'Austin' },
  })
}

describe('draft order — create (catalogue + custom lines, no reservation yet)', () => {
  it('creates an is_draft_order order priced from the catalogue with real tax', async () => {
    const draft = await makeDraft()
    expect(draft.id).toMatch(/^ord_/)
    expect(draft.isDraftOrder).toBe(true)
    expect(draft.status).toBe('draft')
    expect(draft.itemsSubtotal).toBe(1500) // 1000 (catalogue) + 500 (custom)
    expect(draft.taxTotal).toBe(150) // 10% US
    expect(draft.total).toBe(1650)

    const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, draft.id))
    expect(lines).toHaveLength(2)
    // No stock reserved for a draft.
    expect(await reservedQty(db, inventoryItemId)).toBe(0)
  })

  it('does not appear in the draft list once completed, and a placed order is never a draft', async () => {
    const draft = await makeDraft()
    expect((await s.draftOrders.list()).map((d) => d.id)).toContain(draft.id)
    const { orderId } = await placeOrder(s, { regionId, variantId }, 1)
    expect((await s.draftOrders.list()).map((d) => d.id)).not.toContain(orderId)
  })
})

describe('draft order — complete (becomes a payable order)', () => {
  it('reserves stock, flips to a pending non-draft order, and records manual payment', async () => {
    const draft = await makeDraft()
    const completed = await s.draftOrders.complete(draft.id, { markPaid: true })
    expect(completed.isDraftOrder).toBe(false)
    expect(completed.status).toBe('pending')

    // Catalogue line reserved (1 unit); custom line has no variant.
    expect(await reservedQty(db, inventoryItemId)).toBe(1)

    // Manual payment recorded as an append-only order_transaction.
    const txns = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, draft.id))
    const manual = txns.filter((t) => t.reference === 'manual_payment')
    expect(manual).toHaveLength(1)
    expect(manual[0].amount).toBe(1650)
  })

  it('completing twice is rejected and a non-draft order cannot be completed as a draft', async () => {
    const draft = await makeDraft()
    await s.draftOrders.complete(draft.id, {})
    await expect(s.draftOrders.complete(draft.id, {})).rejects.toThrow(/draft|completed/i)

    const { orderId } = await placeOrder(s, { regionId, variantId }, 1)
    await expect(s.draftOrders.complete(orderId, {})).rejects.toThrow(/draft/i)
  })
})

describe('draft order — cancel', () => {
  it('cancels a draft', async () => {
    const draft = await makeDraft()
    const canceled = await s.draftOrders.cancel(draft.id)
    expect(canceled.status).toBe('canceled')
    const [row] = await db.select().from(orders).where(eq(orders.id, draft.id))
    expect(row.status).toBe('canceled')
  })
})
