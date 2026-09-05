import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Id { id: string }
interface Level { stockedQuantity: number }
interface LineItem { id: string; variantId: string | null; quantity: number; total: number }
interface Fulfillment { id: string; shippedAt: string | null; canceledAt: string | null; items: { lineItemId: string; quantity: number }[] }
interface Collection { id: string; amount: number; status: string }
interface OrderDetail {
  id: string
  status: string
  total: number
  items: LineItem[]
  fulfillments: Fulfillment[]
  paymentCollections: Collection[]
  transactions: { amount: number; reference: string }[]
  authorizedAmount: number
  capturedAmount: number
  refundedAmount: number
  paymentStatus: string
  fulfillmentStatus: string
}
interface ReturnDetail { id: string; status: string; items: { lineItemId: string; requestedQuantity: number; receivedQuantity: number; damagedQuantity: number }[] }

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

/**
 * The admin orders screens, exercised through the exact HTTP sequences
 * the UI issues (there is no browser in this suite; the screens are thin over
 * these calls). Each `it` mirrors one screen or wizard:
 *   1. the list screen's enrichment contract (derived statuses on the detail),
 *   2. the « Expédier » wizard (create fulfillment → register shipment),
 *   3. the return screen (request → partial receive restocking → damaged units),
 *   4. the « Modifier » wizard (request → PREVIEW without writes → confirm)
 *      then the extra payment collection + « marquer comme encaissé ».
 */
describe('admin orders (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    // @nuxt/test-utils' own default is 120s and the fleet builds this app in
    // parallel on the same machine — the build alone can outlast it.
    setupTimeout: 300_000,
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  let staffCookie: string
  let regionId: string
  let variantA: string
  let variantB: string
  let inventoryA: string
  let locationId: string

  const admin = <T>(url: string, init: Record<string, unknown> = {}) => $fetch<T>(url, { headers: { cookie: staffCookie }, ...init })
  const getOrder = (id: string) => admin<{ order: OrderDetail }>(`/api/admin/orders/${id}`).then((r) => r.order)

  /** Both variants are inventory-managed: each needs its own stocked item. */
  async function stockVariant(variantId: string, sku: string): Promise<string> {
    const { inventoryItem } = await admin<{ inventoryItem: Id }>('/api/admin/inventory-items', { method: 'POST', body: { sku } })
    await admin(`/api/admin/inventory-items/${inventoryItem.id}/variants`, { method: 'POST', body: { variantId } })
    await admin(`/api/admin/inventory-items/${inventoryItem.id}/location-levels/${locationId}`, { method: 'POST', body: { stockedQuantity: 10 } })
    return inventoryItem.id
  }

  async function stockedA(): Promise<number> {
    const { locationLevels } = await admin<{ locationLevels: Level[] }>(`/api/admin/inventory-items/${inventoryA}/location-levels`)
    return locationLevels.reduce((a, l) => a + l.stockedQuantity, 0)
  }

  it('seeds staff, a region, two priced variants and stock', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('e2-owner@test.pygmalion.dev'))
    regionId = (await admin<{ region: Id }>('/api/admin/regions', { method: 'POST', body: { name: 'E2 Region', currencyCode: 'usd' } })).region.id

    // Two products, one variant each: a product with no option can only carry
    // a single variant (the option combination is unique).
    const shirt = await admin<{ product: Id }>('/api/admin/products', { method: 'POST', body: { title: 'E2 Shirt', status: 'published' } })
    const cap = await admin<{ product: Id }>('/api/admin/products', { method: 'POST', body: { title: 'E2 Cap', status: 'published' } })
    variantA = (await admin<{ variant: Id }>(`/api/admin/products/${shirt.product.id}/variants`, { method: 'POST', body: { title: 'Default' } })).variant.id
    variantB = (await admin<{ variant: Id }>(`/api/admin/products/${cap.product.id}/variants`, { method: 'POST', body: { title: 'Default' } })).variant.id
    await admin('/api/admin/prices/batch', {
      method: 'POST',
      body: { create: [{ variantId: variantA, currencyCode: 'usd', amount: 1000 }, { variantId: variantB, currencyCode: 'usd', amount: 500 }] },
    })

    locationId = (await admin<{ stockLocation: Id }>('/api/admin/stock-locations', { method: 'POST', body: { name: 'E2 Warehouse' } })).stockLocation.id
    inventoryA = await stockVariant(variantA, 'E2-SHIRT')
    await stockVariant(variantB, 'E2-CAP')
  })

  let orderId: string
  let lineA: string
  let lineB: string

  it('the list screen gets a derived payment + fulfillment status per order', async () => {
    const res = await fetch('/api/store/carts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regionId }),
    })
    const cookie = cookiePair(res)
    const cartId = ((await res.json()) as { cart: Id }).cart.id
    await $fetch(`/api/store/carts/${cartId}/line-items`, { method: 'POST', headers: { cookie }, body: { variantId: variantA, quantity: 3 } })
    await $fetch(`/api/store/carts/${cartId}/line-items`, { method: 'POST', headers: { cookie }, body: { variantId: variantB, quantity: 2 } })
    await $fetch(`/api/store/carts/${cartId}`, {
      method: 'POST', headers: { cookie }, body: { email: 'e2-buyer@test.pygmalion.dev', shippingAddress: { countryCode: 'US', city: 'Austin' } },
    })
    await $fetch('/api/store/payment-collections', { method: 'POST', headers: { cookie }, body: { cartId } })
    orderId = (await $fetch<{ order: Id }>(`/api/store/carts/${cartId}/complete`, { method: 'POST', headers: { cookie } })).order.id

    // What `pages/admin/orders/index.vue` reads: the row list, then one
    // detail per row for the two statuses the tabs bucket on.
    const { orders } = await admin<{ orders: Id[] }>('/api/admin/orders', { method: 'GET', query: { limit: 20, offset: 0 } })
    expect(orders.some((o) => o.id === orderId)).toBe(true)

    const order = await getOrder(orderId)
    expect(order.paymentStatus).toBe('authorized') // « À encaisser »
    expect(order.fulfillmentStatus).toBe('not_fulfilled') // « À expédier »
    expect(order.total).toBe(4000) // 3 × 1000 + 2 × 500
    lineA = order.items.find((l) => l.variantId === variantA)!.id
    lineB = order.items.find((l) => l.variantId === variantB)!.id

    // The detail screen collects the authorized funds first (« Encaisser »).
    await admin(`/api/admin/orders/${orderId}/capture`, { method: 'POST', body: {} })
    expect((await getOrder(orderId)).paymentStatus).toBe('captured')
  })

  it('WIZARD « Expédier »: prepare the picked lines, then register the shipment', async () => {
    const before = await stockedA()

    const { fulfillment } = await admin<{ fulfillment: Id }>(`/api/admin/orders/${orderId}/fulfillments`, {
      method: 'POST',
      body: { items: [{ lineItemId: lineA, quantity: 3 }] },
    })
    await admin(`/api/admin/orders/${orderId}/fulfillments/${fulfillment.id}/shipments`, {
      method: 'POST',
      body: { trackingNumber: '1Z-E2-WIZARD' },
    })

    const order = await getOrder(orderId)
    // Line B is untouched, so the order is only PARTLY shipped — exactly what
    // the state machine must show (never "shipped" while units remain).
    expect(order.fulfillmentStatus).toBe('partially_shipped')
    expect(order.fulfillments).toHaveLength(1)
    expect(order.fulfillments[0].shippedAt).not.toBeNull()
    expect(await stockedA()).toBe(before - 3)
  })

  let returnId: string

  it('RETURN screen: request 2 shipped units, receive partially — stock comes back', async () => {
    const { return: created } = await admin<{ return: ReturnDetail }>('/api/admin/returns', {
      method: 'POST',
      body: { orderId, items: [{ lineItemId: lineA, quantity: 2 }], locationId },
    })
    returnId = created.id
    expect(created.status).toBe('requested')

    const before = await stockedA()
    const { return: partial } = await admin<{ return: ReturnDetail }>(`/api/admin/returns/${returnId}/receive`, {
      method: 'POST',
      body: { items: [{ lineItemId: lineA, receivedQuantity: 1 }] },
    })
    expect(partial.status).toBe('partially_received')
    expect(await stockedA()).toBe(before + 1)

    // Second unit comes back damaged: received, but NOT resellable.
    const { return: full } = await admin<{ return: ReturnDetail }>(`/api/admin/returns/${returnId}/receive`, {
      method: 'POST',
      body: { items: [{ lineItemId: lineA, receivedQuantity: 1, damagedQuantity: 1 }] },
    })
    expect(full.status).toBe('received')
    expect(await stockedA()).toBe(before + 1)

    const { return: detail } = await admin<{ return: ReturnDetail }>(`/api/admin/returns/${returnId}`)
    expect(detail.items[0]).toMatchObject({ requestedQuantity: 2, receivedQuantity: 2, damagedQuantity: 1 })
  })

  it('WIZARD « Modifier »: preview writes nothing, confirm applies, the rest becomes collectable', async () => {
    const before = await getOrder(orderId)

    const { orderEdit } = await admin<{ orderEdit: Id }>(`/api/admin/orders/${orderId}/edits`, {
      method: 'POST',
      body: { updates: [{ lineItemId: lineB, quantity: 3 }] },
    })

    const { preview } = await admin<{ preview: { total: number } }>(`/api/admin/orders/${orderId}/edits/${orderEdit.id}/preview`)
    expect(preview.total).toBe(before.total + 500)
    // Garde-fou #3: nothing is written before confirm.
    expect((await getOrder(orderId)).total).toBe(before.total)

    await admin(`/api/admin/orders/${orderId}/edits/${orderEdit.id}/confirm`, { method: 'POST', body: {} })
    const edited = await getOrder(orderId)
    expect(edited.total).toBe(before.total + 500)
    // The extra 500 is not covered by the original authorization.
    expect(edited.total - edited.authorizedAmount).toBe(500)
    expect(edited.paymentStatus).toBe('partially_captured')

    // Confirming the edit opens the extra collection itself — the detail screen
    // shows it as due and offers « Marquer comme encaissé », NOT « Créer un
    // encaissement » (`outstanding()` nets open collections off, unit-tested).
    expect(edited.paymentCollections).toHaveLength(2)
    const extra = edited.paymentCollections.find((c) => c.amount === 500)!
    expect(extra.status).toBe('not_paid')

    await admin(`/api/admin/payment-collections/${extra.id}/mark-as-paid`, { method: 'POST', body: {} })

    const paid = await getOrder(orderId)
    expect(paid.capturedAmount).toBe(paid.total)
    expect(paid.paymentStatus).toBe('captured')
  })

  it('DRAFT screen: a draft becomes a real, already-paid order', async () => {
    const { draftOrder } = await admin<{ draftOrder: Id }>('/api/admin/draft-orders', {
      method: 'POST',
      body: {
        regionId,
        currencyCode: 'usd',
        email: 'e2-phone-buyer@test.pygmalion.dev',
        items: [{ variantId: variantB, quantity: 1 }],
      },
    })

    // Drafts never leak into the standard order list.
    const { orders } = await admin<{ orders: Id[] }>('/api/admin/orders', { method: 'GET', query: { limit: 50 } })
    expect(orders.some((o) => o.id === draftOrder.id)).toBe(false)

    await admin(`/api/admin/draft-orders/${draftOrder.id}/convert-to-order`, { method: 'POST', body: { markPaid: true } })

    const converted = await getOrder(draftOrder.id)
    expect(converted.status).toBe('pending')
    expect(converted.paymentStatus).toBe('captured')
    expect(converted.transactions.some((t) => t.reference === 'manual_payment')).toBe(true)
  })
})
