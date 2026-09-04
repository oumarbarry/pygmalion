import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Id { id: string }
interface Cart { id: string; total: number }
interface Order { id: string; status: string; total: number; transactions: { amount: number; reference: string }[] }
interface Reservation { id: string; quantity: number }

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// Checkout: the full flow over HTTP with the manual
// provider (success + deferred capture + partial refund), the `always-fail`
// demo provider (authorize fails -> order canceled + reserved stock freed),
// and an idempotent replay.
describe('checkout: cart -> order (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  let staffCookie: string
  let regionId: string
  let variantId: string
  let inventoryItemId: string

  async function reservationsForItem(): Promise<Reservation[]> {
    const { reservations } = await $fetch<{ reservations: Reservation[] }>(
      `/api/admin/reservations?inventoryItemId=${inventoryItemId}`,
      { headers: { cookie: staffCookie } },
    )
    return reservations
  }
  const reservedQty = (rs: Reservation[]) => rs.reduce((a, r) => a + r.quantity, 0)

  it('seeds staff, region, a 10.00 variant, 10% US tax, and 10 units of stock', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('checkout-owner@test.pygmalion.dev'))

    regionId = (await $fetch<{ region: Id }>('/api/admin/regions', {
      method: 'POST', headers: { cookie: staffCookie }, body: { name: 'Checkout Region', currencyCode: 'usd' },
    })).region.id

    const product = await $fetch<{ product: Id }>('/api/admin/products', {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Checkout Mug', status: 'published' },
    })
    variantId = (await $fetch<{ variant: Id }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Default' },
    })).variant.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST', headers: { cookie: staffCookie }, body: { create: [{ variantId, currencyCode: 'usd', amount: 1000 }] },
    })

    const taxRegion = await $fetch<{ taxRegion: Id }>('/api/admin/tax-regions', {
      method: 'POST', headers: { cookie: staffCookie }, body: { countryCode: 'US' },
    })
    await $fetch('/api/admin/tax-rates', {
      method: 'POST', headers: { cookie: staffCookie }, body: { taxRegionId: taxRegion.taxRegion.id, code: 'STD', name: 'Standard', rate: 10, isDefault: true },
    })

    const location = await $fetch<{ stockLocation: Id }>('/api/admin/stock-locations', {
      method: 'POST', headers: { cookie: staffCookie }, body: { name: 'Main' },
    })
    inventoryItemId = (await $fetch<{ inventoryItem: Id }>('/api/admin/inventory-items', {
      method: 'POST', headers: { cookie: staffCookie }, body: { sku: 'CHECKOUT-MUG' },
    })).inventoryItem.id
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/variants`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { variantId },
    })
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/location-levels/${location.stockLocation.id}`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { stockedQuantity: 10 },
    })
  })

  // --- helper: a guest cart with `qty` units and a US shipping address --------
  async function readyCart(qty: number): Promise<{ cartId: string; cookie: string; total: number }> {
    const res = await fetch('/api/store/carts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regionId }),
    })
    const cookie = cookiePair(res)
    const cartId = ((await res.json()) as { cart: Cart }).cart.id
    await $fetch(`/api/store/carts/${cartId}/line-items`, { method: 'POST', headers: { cookie }, body: { variantId, quantity: qty } })
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, {
      method: 'POST', headers: { cookie }, body: { email: 'buyer@test.pygmalion.dev', shippingAddress: { countryCode: 'US', city: 'Austin' } },
    })
    return { cartId, cookie, total: cart.total }
  }

  let placedOrderId: string

  it('SUCCESS: payment session -> complete -> order placed, stock reserved, order.placed drained', async () => {
    const { cartId, cookie, total } = await readyCart(2)
    expect(total).toBe(2200) // 2000 + 10% tax
    expect(reservedQty(await reservationsForItem())).toBe(0)

    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    const done = await $fetch<{ type: string; status: string; order: Order }>(`/api/store/carts/${cartId}/complete`, {
      method: 'POST', headers: { cookie },
    })
    expect(done.type).toBe('order')
    expect(done.status).toBe('authorized')
    expect(done.order.status).toBe('pending')
    expect(done.order.total).toBe(2200)
    placedOrderId = done.order.id

    expect(reservedQty(await reservationsForItem())).toBe(2)

    // order.placed reached the demo event sink (outbox drained).
    await new Promise((r) => setTimeout(r, 600))
    const { events } = await $fetch<{ events: { event: string }[] }>('/api/_demo/events')
    expect(events.some((e) => e.event === 'order.placed')).toBe(true)
  })

  it('IDEMPOTENT: replaying complete returns the same order, no double reserve', async () => {
    const { cartId, cookie } = await readyCart(1)
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    const first = await $fetch<{ order: Order }>(`/api/store/carts/${cartId}/complete`, { method: 'POST', headers: { cookie } })
    const reservedAfterFirst = reservedQty(await reservationsForItem())
    const second = await $fetch<{ status: string; order: Order }>(`/api/store/carts/${cartId}/complete`, { method: 'POST', headers: { cookie } })
    expect(second.status).toBe('already_complete')
    expect(second.order.id).toBe(first.order.id)
    expect(reservedQty(await reservationsForItem())).toBe(reservedAfterFirst) // no extra reservation
  })

  it('FAILURE: authorize fails -> order canceled + reserved stock released (capital assertion)', async () => {
    const reservedBefore = reservedQty(await reservationsForItem())
    const { cartId, cookie } = await readyCart(3)
    // Use the demo always-fail payment provider.
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId, providerId: 'always-fail' } })
    const done = await $fetch<{ type: string; status: string; order: Order }>(`/api/store/carts/${cartId}/complete`, {
      method: 'POST', headers: { cookie },
    })
    expect(done.type).toBe('cart')
    expect(done.status).toBe('error')
    expect(done.order.status).toBe('canceled')
    // The 3 units it reserved in TX1 are freed — reserved total back to before.
    expect(reservedQty(await reservationsForItem())).toBe(reservedBefore)

    // Cart is reusable (Medusa parity): recreate a session with the manual
    // provider and retry — succeeds on the SAME cart with a NEW order.
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    const retry = await $fetch<{ type: string; status: string; order: Order }>(`/api/store/carts/${cartId}/complete`, {
      method: 'POST', headers: { cookie },
    })
    expect(retry.type).toBe('order')
    expect(retry.status).toBe('authorized')
    expect(retry.order.id).not.toBe(done.order.id) // new order, not the canceled one
    expect(retry.order.status).toBe('pending')
  })

  it('ADMIN: deferred capture then partial refund record append-only transactions', async () => {
    const captured = await $fetch<{ order: Order }>(`/api/admin/orders/${placedOrderId}/capture`, {
      method: 'POST', headers: { cookie: staffCookie }, body: {},
    })
    expect(captured.order.transactions.filter((t) => t.reference === 'capture').reduce((a, t) => a + t.amount, 0)).toBe(2200)

    const refunded = await $fetch<{ order: Order }>(`/api/admin/orders/${placedOrderId}/refund`, {
      method: 'POST', headers: { cookie: staffCookie }, body: { amount: 500 },
    })
    expect(refunded.order.transactions.filter((t) => t.reference === 'refund').reduce((a, t) => a + t.amount, 0)).toBe(-500)
  })
})
