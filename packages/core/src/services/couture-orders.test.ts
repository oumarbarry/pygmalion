import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { makeStack, placeOrder, seedCatalog, type Stack } from './order-test-fixture'

// Admin order needs: order events readable, addresses hydrated on the order
// sheet, list filters + count paired for pagination.

let db: PygmalionDatabase
let s: Stack
let regionId: string
let variantId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  s = makeStack(db)
  const seed = await seedCatalog(s, { unitPrice: 1000, stock: 20 })
  regionId = seed.regionId
  variantId = seed.variants[0].variantId
})

describe('order sheet', () => {
  it('hydrates the shipping address on getOrder', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 1)
    const order = (await s.checkout.getOrder(orderId))!
    expect(order.shippingAddress).not.toBeNull()
    expect(order.shippingAddress!.city).toBe('Austin')
    expect(order.shippingAddress!.countryCode!.toLowerCase()).toBe('us')
    expect(order.billingAddress).toBeNull()
  })

  it('exposes the append-only audit journal, newest first', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 1, { capture: true })
    const events = await s.checkout.listOrderEvents(orderId)
    expect(events.length).toBeGreaterThanOrEqual(2) // order.created + payment.captured
    expect(events.every((e) => e.orderId === orderId)).toBe(true)
    const types = events.map((e) => e.type)
    expect(types).toContain('order.created')
    // Newest first.
    const times = events.map((e) => e.createdAt.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })
})

describe('order list — q / status / count', () => {
  it('filters by email fragment and pairs count with the same filters', async () => {
    await placeOrder(s, { regionId, variantId }, 1)
    await placeOrder(s, { regionId, variantId }, 2)
    const all = await s.checkout.listOrders({})
    expect(all).toHaveLength(2)
    expect(await s.checkout.countOrders({})).toBe(2)

    // placeOrder does not set an email — q on a fragment that matches ids.
    const byId = await s.checkout.listOrders({ q: all[0].id.slice(0, 8) })
    expect(byId.map((o) => o.id)).toContain(all[0].id)
    expect(await s.checkout.countOrders({ q: 'no-such-order-xyz' })).toBe(0)
  })

  it('filters by status', async () => {
    const { orderId } = await placeOrder(s, { regionId, variantId }, 1)
    await placeOrder(s, { regionId, variantId }, 1)
    await s.checkout.cancelOrder(orderId, {})
    expect(await s.checkout.countOrders({ status: 'canceled' })).toBe(1)
    const pending = await s.checkout.listOrders({ status: 'pending' })
    expect(pending).toHaveLength(1)
    expect(pending[0].id).not.toBe(orderId)
  })
})
