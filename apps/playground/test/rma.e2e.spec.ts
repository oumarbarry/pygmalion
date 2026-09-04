import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Id { id: string }
interface Cart { id: string; total: number }
interface LineItem { id: string; quantity: number }
interface Transaction { amount: number; reference: string }
interface Order { id: string; status: string; total: number; items: LineItem[]; transactions: Transaction[]; isDraftOrder: boolean }
interface Return { id: string; status: string }
interface Level { stockedQuantity: number }

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// RMA over HTTP: return happy path (request on shipped lines ->
// partial receive -> full receive restocking the shelf + refunding through the
// append-only ledger), draft order -> real payable order, and the store
// order endpoints (owner-by-email guest access, drafts invisible).
describe('RMA: returns, draft orders, store orders (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  let staffCookie: string
  let regionId: string
  let variantId: string
  let inventoryItemId: string
  let locationId: string

  async function stockedQty(): Promise<number> {
    const { locationLevels } = await $fetch<{ locationLevels: Level[] }>(
      `/api/admin/inventory-items/${inventoryItemId}/location-levels`,
      { headers: { cookie: staffCookie } },
    )
    return locationLevels.reduce((a, l) => a + l.stockedQuantity, 0)
  }

  it('seeds staff, region, a 10.00 variant and 10 units of stock', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('rma-owner@test.pygmalion.dev'))
    regionId = (await $fetch<{ region: Id }>('/api/admin/regions', {
      method: 'POST', headers: { cookie: staffCookie }, body: { name: 'RMA Region', currencyCode: 'usd' },
    })).region.id
    const product = await $fetch<{ product: Id }>('/api/admin/products', {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'RMA Mug', status: 'published' },
    })
    variantId = (await $fetch<{ variant: Id }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Default' },
    })).variant.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST', headers: { cookie: staffCookie }, body: { create: [{ variantId, currencyCode: 'usd', amount: 1000 }] },
    })
    locationId = (await $fetch<{ stockLocation: Id }>('/api/admin/stock-locations', {
      method: 'POST', headers: { cookie: staffCookie }, body: { name: 'RMA Main' },
    })).stockLocation.id
    inventoryItemId = (await $fetch<{ inventoryItem: Id }>('/api/admin/inventory-items', {
      method: 'POST', headers: { cookie: staffCookie }, body: { sku: 'RMA-MUG' },
    })).inventoryItem.id
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/variants`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { variantId },
    })
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { stockedQuantity: 10 },
    })
  })

  let orderId: string
  let lineItemId: string
  let reasonId: string

  it('creates a return reason and places+captures+ships an order of 3 units', async () => {
    reasonId = (await $fetch<{ returnReason: Id }>('/api/admin/return-reasons', {
      method: 'POST', headers: { cookie: staffCookie }, body: { value: 'wrong_size', label: 'Wrong size' },
    })).returnReason.id
    expect(reasonId).toMatch(/^rr_/)

    const res = await fetch('/api/store/carts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regionId }),
    })
    const cookie = cookiePair(res)
    const cartId = ((await res.json()) as { cart: Cart }).cart.id
    await $fetch(`/api/store/carts/${cartId}/line-items`, { method: 'POST', headers: { cookie }, body: { variantId, quantity: 3 } })
    await $fetch(`/api/store/carts/${cartId}`, {
      method: 'POST', headers: { cookie }, body: { email: 'rma-buyer@test.pygmalion.dev', shippingAddress: { countryCode: 'US', city: 'Austin' } },
    })
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    orderId = (await $fetch<{ order: Id }>(`/api/store/carts/${cartId}/complete`, { method: 'POST', headers: { cookie } })).order.id

    // Capture the funds so the return refund has something to refund.
    await $fetch(`/api/admin/orders/${orderId}/capture`, { method: 'POST', headers: { cookie: staffCookie }, body: {} })

    const { order } = await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: { cookie: staffCookie } })
    lineItemId = order.items[0].id

    // Fulfill + ship all 3 — only SHIPPED lines are returnable.
    const { fulfillment } = await $fetch<{ fulfillment: Id }>(`/api/admin/orders/${orderId}/fulfillments`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { items: [{ lineItemId, quantity: 3 }] },
    })
    await $fetch(`/api/admin/orders/${orderId}/fulfillments/${fulfillment.id}/shipments`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { trackingNumber: '1Z-RMA' },
    })
    expect(await stockedQty()).toBe(7) // 10 - 3 shipped
  })

  let returnId: string

  it('RETURN HAPPY PATH: request 2 shipped units, receive partially, then fully — stock restocked + refund recorded', async () => {
    const { return: ret } = await $fetch<{ return: Return }>('/api/admin/returns', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { orderId, items: [{ lineItemId, quantity: 2, reasonId }], refundAmount: 2000 },
    })
    returnId = ret.id
    expect(returnId).toMatch(/^ret_/)
    expect(ret.status).toBe('requested')

    // Partial receive: 1 of 2 units back on the shelf.
    const partial = await $fetch<{ return: Return }>(`/api/admin/returns/${returnId}/receive`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { items: [{ lineItemId, receivedQuantity: 1 }] },
    })
    expect(partial.return.status).toBe('partially_received')
    expect(await stockedQty()).toBe(8)

    // Final receive: fully received, stock back to 9, refund hits the ledger.
    const full = await $fetch<{ return: Return }>(`/api/admin/returns/${returnId}/receive`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { items: [{ lineItemId, receivedQuantity: 1 }] },
    })
    expect(full.return.status).toBe('received')
    expect(await stockedQty()).toBe(9)

    const { order } = await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: { cookie: staffCookie } })
    const refunded = order.transactions.filter((t) => t.reference === 'refund').reduce((a, t) => a + t.amount, 0)
    expect(refunded).toBe(-2000) // signed-negative, append-only
  })

  it('INVALID: over-requesting beyond the shipped remainder is refused, and a received return cannot be canceled', async () => {
    // 3 shipped, 2 already requested -> only 1 returnable.
    await expect($fetch('/api/admin/returns', {
      method: 'POST', headers: { cookie: staffCookie }, body: { orderId, items: [{ lineItemId, quantity: 2 }] },
    })).rejects.toThrow()

    await expect($fetch(`/api/admin/returns/${returnId}/cancel`, {
      method: 'POST', headers: { cookie: staffCookie }, body: {},
    })).rejects.toThrow()
  })

  it('DRAFT ORDER: created as a draft, invisible in the order list, then converted to a payable order', async () => {
    const { draftOrder } = await $fetch<{ draftOrder: Order }>('/api/admin/draft-orders', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: {
        regionId,
        currencyCode: 'usd',
        email: 'draft-buyer@test.pygmalion.dev',
        items: [{ variantId, quantity: 1 }, { title: 'Gift wrap', unitPrice: 500, quantity: 1 }],
        shippingAddress: { countryCode: 'US', city: 'Austin' },
      },
    })
    expect(draftOrder.isDraftOrder).toBe(true)
    expect(draftOrder.status).toBe('draft')
    expect(draftOrder.total).toBe(1500) // 1000 catalogue + 500 custom

    // A draft never shows up in the standard order list.
    const { orders } = await $fetch<{ orders: Order[] }>('/api/admin/orders', { headers: { cookie: staffCookie } })
    expect(orders.map((o) => o.id)).not.toContain(draftOrder.id)

    const { order } = await $fetch<{ order: Order }>(`/api/admin/draft-orders/${draftOrder.id}/convert-to-order`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { markPaid: true },
    })
    expect(order.isDraftOrder).toBe(false)
    expect(order.status).toBe('pending')

    // Manual payment recorded on the append-only ledger; converting twice fails.
    const detail = await $fetch<{ order: Order }>(`/api/admin/orders/${order.id}`, { headers: { cookie: staffCookie } })
    expect(detail.order.transactions.filter((t) => t.reference === 'manual_payment')).toHaveLength(1)
    await expect($fetch(`/api/admin/draft-orders/${draftOrder.id}/convert-to-order`, {
      method: 'POST', headers: { cookie: staffCookie }, body: {},
    })).rejects.toThrow()

    // Now it IS in the standard list.
    const after = await $fetch<{ orders: Order[] }>('/api/admin/orders', { headers: { cookie: staffCookie } })
    expect(after.orders.map((o) => o.id)).toContain(order.id)
  })

  it('STORE: a guest reads its order with the matching email, and a wrong email is forbidden', async () => {
    const { order } = await $fetch<{ order: Order }>(`/api/store/orders/${orderId}?email=rma-buyer@test.pygmalion.dev`)
    expect(order.id).toBe(orderId)
    await expect($fetch(`/api/store/orders/${orderId}?email=someone-else@test.pygmalion.dev`)).rejects.toThrow()
    // No session, no email -> 403.
    await expect($fetch(`/api/store/orders/${orderId}`)).rejects.toThrow()
  })

  // POST /store/returns: the customer-initiated request.
  it('STORE: a guest requests a return on its own order; money fields are never client-controlled', async () => {
    await expect($fetch('/api/store/returns', {
      method: 'POST',
      body: { orderId, email: 'someone-else@test.pygmalion.dev', items: [{ lineItemId, quantity: 1 }] },
    })).rejects.toMatchObject({ statusCode: 403 })

    // 3 shipped − 2 already returned = 1 returnable.
    const { return: ret } = await $fetch<{ return: Return & { refundAmount: number | null } }>('/api/store/returns', {
      method: 'POST',
      body: {
        orderId,
        email: 'rma-buyer@test.pygmalion.dev',
        items: [{ lineItemId, quantity: 1, reasonId }],
        // A client-supplied refund amount must never reach the service.
        refundAmount: 999999,
        locationId: 'sloc_hacked',
      },
    })
    expect(ret.status).toBe('requested')
    expect(ret.refundAmount).toBeNull()

    // The service guard still applies: nothing returnable left.
    await expect($fetch('/api/store/returns', {
      method: 'POST',
      body: { orderId, email: 'rma-buyer@test.pygmalion.dev', items: [{ lineItemId, quantity: 1 }] },
    })).rejects.toMatchObject({ statusCode: 422 })
  })
})
