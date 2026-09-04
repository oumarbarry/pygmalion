import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Id { id: string }
interface Cart { id: string; total: number }
interface Collection { id: string; amount: number; status: string; orderId: string | null; capturedAmount?: number }
interface Payment { id: string; amount: number; captured: number; refunded: number; orderId: string | null }
interface Order {
  id: string
  total: number
  paymentStatus: string
  capturedAmount: number
  authorizedAmount: number
  paymentCollections: Collection[]
  transactions: { amount: number; reference: string }[]
}

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// An order edit that RAISES the total opens an additional
// payment collection, encaissable over HTTP (mark-as-paid), and the order's
// derived payment status follows the encashment.
describe('additional payment collection (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  let staffCookie: string
  let regionId: string
  let variantId: string
  let orderId: string

  const admin = () => ({ cookie: staffCookie })
  const getOrder = async () => (await $fetch<{ order: Order }>(`/api/admin/orders/${orderId}`, { headers: admin() })).order

  it('seeds staff, region, a 10.00 variant and stock', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('paycol-owner@test.pygmalion.dev'))
    regionId = (await $fetch<{ region: Id }>('/api/admin/regions', {
      method: 'POST', headers: admin(), body: { name: 'PayCol Region', currencyCode: 'usd' },
    })).region.id
    const product = await $fetch<{ product: Id }>('/api/admin/products', {
      method: 'POST', headers: admin(), body: { title: 'PayCol Mug', status: 'published' },
    })
    variantId = (await $fetch<{ variant: Id }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST', headers: admin(), body: { title: 'Default' },
    })).variant.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST', headers: admin(), body: { create: [{ variantId, currencyCode: 'usd', amount: 1000 }] },
    })
    const location = await $fetch<{ stockLocation: Id }>('/api/admin/stock-locations', {
      method: 'POST', headers: admin(), body: { name: 'PayCol Main' },
    })
    const item = await $fetch<{ inventoryItem: Id }>('/api/admin/inventory-items', {
      method: 'POST', headers: admin(), body: { sku: 'PAYCOL-MUG' },
    })
    await $fetch(`/api/admin/inventory-items/${item.inventoryItem.id}/variants`, {
      method: 'POST', headers: admin(), body: { variantId },
    })
    await $fetch(`/api/admin/inventory-items/${item.inventoryItem.id}/location-levels/${location.stockLocation.id}`, {
      method: 'POST', headers: admin(), body: { stockedQuantity: 10 },
    })
  })

  it('places and fully captures an order of 2 units (2000)', async () => {
    const res = await fetch('/api/store/carts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regionId }),
    })
    const cookie = cookiePair(res)
    const cartId = ((await res.json()) as { cart: Cart }).cart.id
    await $fetch(`/api/store/carts/${cartId}/line-items`, { method: 'POST', headers: { cookie }, body: { variantId, quantity: 2 } })
    await $fetch(`/api/store/carts/${cartId}`, {
      method: 'POST', headers: { cookie }, body: { email: 'paycol@test.pygmalion.dev', shippingAddress: { countryCode: 'US', city: 'Austin' } },
    })
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    const done = await $fetch<{ order: Id }>(`/api/store/carts/${cartId}/complete`, { method: 'POST', headers: { cookie } })
    orderId = done.order.id

    await $fetch(`/api/admin/orders/${orderId}/capture`, { method: 'POST', headers: admin(), body: {} })
    const order = await getOrder()
    expect(order.total).toBe(2000)
    expect(order.paymentStatus).toBe('captured')
    expect(order.paymentCollections).toHaveLength(1)
  })

  let additionalId: string

  it('an order edit that raises the total opens an additional collection for the delta', async () => {
    const before = await getOrder()
    const edit = await $fetch<{ orderEdit: Id }>(`/api/admin/orders/${orderId}/edits`, {
      method: 'POST', headers: admin(), body: { additions: [{ variantId, title: 'Extra mug', unitPrice: 1000, quantity: 1 }] },
    })
    await $fetch(`/api/admin/orders/${orderId}/edits/${edit.orderEdit.id}/confirm`, { method: 'POST', headers: admin() })

    const after = await getOrder()
    expect(after.total).toBe(before.total + 1000)
    expect(after.paymentCollections).toHaveLength(2)
    const additional = after.paymentCollections[1]
    additionalId = additional.id
    expect(additional.amount).toBe(1000)
    expect(additional.status).toBe('not_paid')
    // The raise is not paid yet: the derived status says so.
    expect(after.paymentStatus).toBe('partially_captured')
  })

  it('refuses a second collection for a debt the open one already covers', async () => {
    await expect($fetch('/api/admin/payment-collections', {
      method: 'POST', headers: admin(), body: { orderId, amount: 5000 },
    })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('mark-as-paid captures the additional collection and the order becomes fully captured', async () => {
    const { paymentCollection } = await $fetch<{ paymentCollection: Collection }>(
      `/api/admin/payment-collections/${additionalId}/mark-as-paid`,
      { method: 'POST', headers: admin(), body: {} },
    )
    expect(paymentCollection.status).toBe('captured')
    expect(paymentCollection.capturedAmount).toBe(1000)

    const order = await getOrder()
    expect(order.paymentStatus).toBe('captured')
    expect(order.capturedAmount).toBe(order.total)
    // Append-only ledger: 2000 + 1000 captured, traced on the order.
    expect(order.transactions.filter((t) => t.reference === 'capture').reduce((a, t) => a + t.amount, 0)).toBe(3000)
  })

  it('is single-shot: marking the same collection paid twice is refused', async () => {
    await expect($fetch(`/api/admin/payment-collections/${additionalId}/mark-as-paid`, {
      method: 'POST', headers: admin(), body: {},
    })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('GET /api/admin/payments lists both authorizations of the order, /:id details one', async () => {
    const { payments } = await $fetch<{ payments: Payment[] }>(`/api/admin/payments?orderId=${orderId}`, { headers: admin() })
    expect(payments).toHaveLength(2)
    expect(payments.reduce((a, p) => a + p.captured, 0)).toBe(3000)

    const detail = await $fetch<{ payment: Payment & { captures: { amount: number }[] } }>(`/api/admin/payments/${payments[0].id}`, { headers: admin() })
    expect(detail.payment.orderId).toBe(orderId)
    expect(detail.payment.captures.length).toBeGreaterThan(0)
  })

  it('refunds a precise payment and caps the refund at what THAT payment captured', async () => {
    const { payments } = await $fetch<{ payments: Payment[] }>(`/api/admin/payments?orderId=${orderId}`, { headers: admin() })
    const additionalPayment = payments.find((p) => p.amount === 1000)!
    await expect($fetch(`/api/admin/payments/${additionalPayment.id}/refund`, {
      method: 'POST', headers: admin(), body: { amount: 1500 },
    })).rejects.toMatchObject({ statusCode: 422 })

    const { order } = await $fetch<{ order: Order }>(`/api/admin/payments/${additionalPayment.id}/refund`, {
      method: 'POST', headers: admin(), body: { amount: 400 },
    })
    expect(order.paymentStatus).toBe('partially_refunded')
    expect(order.transactions.some((t) => t.reference === 'refund' && t.amount === -400)).toBe(true)
  })

  // A converted draft order carries NO payment collection (it never went
  // through checkout): POST /admin/payment-collections is how it becomes
  // collectable at all, and the session goes through the payment domain unchanged.
  it('opens a collection + a session on a converted draft order', async () => {
    const draft = await $fetch<{ draftOrder: { id: string; total: number } }>('/api/admin/draft-orders', {
      method: 'POST',
      headers: admin(),
      body: { email: 'draft@test.pygmalion.dev', regionId, currencyCode: 'usd', items: [{ variantId, title: 'Mug', unitPrice: 1000, quantity: 2 }] },
    })
    await $fetch(`/api/admin/draft-orders/${draft.draftOrder.id}/convert-to-order`, { method: 'POST', headers: admin(), body: {} })

    const { paymentCollection } = await $fetch<{ paymentCollection: Collection }>('/api/admin/payment-collections', {
      method: 'POST', headers: admin(), body: { orderId: draft.draftOrder.id },
    })
    expect(paymentCollection.amount).toBe(draft.draftOrder.total)

    const { paymentSession } = await $fetch<{ paymentSession: { id: string; status: string; amount: number } }>(
      `/api/admin/payment-collections/${paymentCollection.id}/payment-sessions`,
      { method: 'POST', headers: admin(), body: { providerId: 'manual' } },
    )
    expect(paymentSession.id).toMatch(/^payses_/)
    expect(paymentSession.amount).toBe(draft.draftOrder.total)

    const { paymentCollection: paid } = await $fetch<{ paymentCollection: Collection }>(
      `/api/admin/payment-collections/${paymentCollection.id}/mark-as-paid`,
      { method: 'POST', headers: admin(), body: {} },
    )
    expect(paid.status).toBe('captured')
    const { order } = await $fetch<{ order: Order }>(`/api/admin/orders/${draft.draftOrder.id}`, { headers: admin() })
    expect(order.paymentStatus).toBe('captured')
  })
})
