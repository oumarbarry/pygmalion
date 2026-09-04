import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Id { id: string }
interface Cart { id: string; total: number }
interface LineItem { id: string; quantity: number }
interface Fulfillment { id: string; shippedAt: string | null; deliveredAt: string | null; canceledAt: string | null }
interface Order { id: string; items: LineItem[]; fulfillmentStatus: string; fulfillments: Fulfillment[] }
interface Reservation { id: string; quantity: number }

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// Fulfillment happy path over HTTP: place an order, create a fulfillment
// (stock decremented + reservation reduced), register a shipment, mark
// delivered; the derived order fulfillment_status walks
// not_fulfilled -> fulfilled -> shipped -> delivered.
describe('fulfillment: order -> fulfilled -> shipped -> delivered (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  let staffCookie: string
  let regionId: string
  let variantId: string
  let inventoryItemId: string

  async function reservedQty(): Promise<number> {
    const { reservations } = await $fetch<{ reservations: Reservation[] }>(
      `/api/admin/reservations?inventoryItemId=${inventoryItemId}`,
      { headers: { cookie: staffCookie } },
    )
    return reservations.reduce((a, r) => a + r.quantity, 0)
  }

  it('seeds staff, region, a variant and 10 units of stock', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('fulfillment-owner@test.pygmalion.dev'))
    regionId = (await $fetch<{ region: Id }>('/api/admin/regions', {
      method: 'POST', headers: { cookie: staffCookie }, body: { name: 'Fulfillment Region', currencyCode: 'usd' },
    })).region.id
    const product = await $fetch<{ product: Id }>('/api/admin/products', {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Fulfillment Mug', status: 'published' },
    })
    variantId = (await $fetch<{ variant: Id }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Default' },
    })).variant.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST', headers: { cookie: staffCookie }, body: { create: [{ variantId, currencyCode: 'usd', amount: 1000 }] },
    })
    const location = await $fetch<{ stockLocation: Id }>('/api/admin/stock-locations', {
      method: 'POST', headers: { cookie: staffCookie }, body: { name: 'Main' },
    })
    inventoryItemId = (await $fetch<{ inventoryItem: Id }>('/api/admin/inventory-items', {
      method: 'POST', headers: { cookie: staffCookie }, body: { sku: 'FULFILLMENT-MUG' },
    })).inventoryItem.id
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/variants`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { variantId },
    })
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/location-levels/${location.stockLocation.id}`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { stockedQuantity: 10 },
    })
  })

  let orderId: string
  let lineItemId: string

  it('places an order of 3 units and reserves the stock', async () => {
    const res = await fetch('/api/store/carts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regionId }),
    })
    const cookie = cookiePair(res)
    const cartId = ((await res.json()) as { cart: Cart }).cart.id
    await $fetch(`/api/store/carts/${cartId}/line-items`, { method: 'POST', headers: { cookie }, body: { variantId, quantity: 3 } })
    await $fetch(`/api/store/carts/${cartId}`, {
      method: 'POST', headers: { cookie }, body: { email: 'buyer@test.pygmalion.dev', shippingAddress: { countryCode: 'US', city: 'Austin' } },
    })
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    const done = await $fetch<{ order: { id: string } }>(`/api/store/carts/${cartId}/complete`, { method: 'POST', headers: { cookie } })
    orderId = done.order.id
    expect(await reservedQty()).toBe(3)

    const { order } = await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: { cookie: staffCookie } })
    expect(order.fulfillmentStatus).toBe('not_fulfilled')
    lineItemId = order.items[0].id
  })

  it('creates a fulfillment for all 3 units: stock reserved drops to 0, status fulfilled', async () => {
    const { fulfillment } = await $fetch<{ fulfillment: Fulfillment }>(`/api/admin/orders/${orderId}/fulfillments`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { items: [{ lineItemId, quantity: 3 }] },
    })
    expect(fulfillment.id).toMatch(/^ful_/)
    expect(await reservedQty()).toBe(0)
    const { order } = await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: { cookie: staffCookie } })
    expect(order.fulfillmentStatus).toBe('fulfilled')

    // register a shipment
    const fid = order.fulfillments[0].id
    const shipped = await $fetch<{ fulfillment: Fulfillment }>(`/api/admin/orders/${orderId}/fulfillments/${fid}/shipments`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { trackingNumber: '1Z-E2E' },
    })
    expect(shipped.fulfillment.shippedAt).not.toBeNull()
    expect((await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: { cookie: staffCookie } })).order.fulfillmentStatus).toBe('shipped')

    // mark delivered
    const delivered = await $fetch<{ fulfillment: Fulfillment }>(`/api/admin/orders/${orderId}/fulfillments/${fid}/mark-as-delivered`, {
      method: 'POST', headers: { cookie: staffCookie }, body: {},
    })
    expect(delivered.fulfillment.deliveredAt).not.toBeNull()
    expect((await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: { cookie: staffCookie } })).order.fulfillmentStatus).toBe('delivered')
  })
})
