import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Region {
  id: string
}
interface Product {
  id: string
}
interface Variant {
  id: string
}
interface TaxRegion {
  id: string
}
interface CartLineItem {
  id: string
  quantity: number
  unitPrice: number
  subtotal: number
  taxTotal: number
  total: number
}
interface CartShippingMethod {
  id: string
  amount: number
}
interface Cart {
  id: string
  token: string
  customerId: string | null
  itemsSubtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  total: number
  items: CartLineItem[]
  shippingMethods: CartShippingMethod[]
}

/** Just the `name=value` pair off a raw `set-cookie` header — safe to combine with another cookie in one request. */
function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// Cart domain: the full store flow:
// create → add items → addresses → shipping method → GET with the exact
// persisted totals a real checkout will read straight off the row.
describe('cart: store flow (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let staffCookie: string
  let regionId: string
  let variantId: string

  it('seeds staff, a region, a 10.00 priced variant, and a 10% US tax rate', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('cart-owner@test.pygmalion.dev'))

    const region = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'Cart E2E Region', currencyCode: 'usd' },
    })
    regionId = region.region.id

    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { title: 'E2E Cart Mug' },
    })
    const variant = await $fetch<{ variant: Variant }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { title: 'Default' },
    })
    variantId = variant.variant.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { create: [{ variantId, currencyCode: 'usd', amount: 1000 }] },
    })

    const taxRegion = await $fetch<{ taxRegion: TaxRegion }>('/api/admin/tax-regions', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { countryCode: 'US' },
    })
    await $fetch('/api/admin/tax-rates', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { taxRegionId: taxRegion.taxRegion.id, code: 'STD', name: 'Standard', rate: 10, isDefault: true },
    })
  })

  let cartCookie: string
  let cartId: string

  it('POST /api/store/carts creates a guest cart and sets the cart-token cookie', async () => {
    const res = await fetch('/api/store/carts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regionId }),
    })
    expect(res.ok).toBe(true)
    cartCookie = cookiePair(res)
    const { cart } = (await res.json()) as { cart: Cart }
    cartId = cart.id
    expect(cart.id).toMatch(/^cart_/)
    expect(cart.total).toBe(0)
    expect(cart.items).toEqual([])
  })

  it('GET with no/wrong cart-token cookie 404s (not 403 — no existence leak)', async () => {
    await expect($fetch(`/api/store/carts/${cartId}`)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('POST .../line-items adds an item: price snapshot, no address yet -> no tax', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { variantId, quantity: 2 },
    })
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].unitPrice).toBe(1000)
    expect(cart.items[0].quantity).toBe(2)
    expect(cart.itemsSubtotal).toBe(2000)
    expect(cart.total).toBe(2000)
  })

  it('POST /:id sets the shipping address + email, activating the 10% US tax rate', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { email: 'shopper@test.pygmalion.dev', shippingAddress: { countryCode: 'US', city: 'Austin' } },
    })
    expect(cart.taxTotal).toBe(200) // 10% of 2000
    expect(cart.total).toBe(2200)
  })

  it('POST .../shipping-methods adds a flat charge, folded straight into the total', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/shipping-methods`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { name: 'Standard', amount: 500 },
    })
    expect(cart.shippingMethods).toHaveLength(1)
    expect(cart.shippingTotal).toBe(500)
    expect(cart.total).toBe(2700) // 2000 items + 200 tax + 500 shipping
  })

  it('GET returns the exact same persisted totals — no recompute-at-read', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, { headers: { cookie: cartCookie } })
    expect(cart.itemsSubtotal).toBe(2000)
    expect(cart.taxTotal).toBe(200)
    expect(cart.shippingTotal).toBe(500)
    expect(cart.discountTotal).toBe(0)
    expect(cart.total).toBe(2700)
  })

  it('POST .../line-items/:lineId changes quantity and recalculates every total', async () => {
    const before = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, { headers: { cookie: cartCookie } })
    const lineId = before.cart.items[0].id
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items/${lineId}`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { quantity: 3 },
    })
    expect(cart.items[0].quantity).toBe(3)
    expect(cart.itemsSubtotal).toBe(3000)
    expect(cart.taxTotal).toBe(300)
    expect(cart.total).toBe(3800) // 3000 + 300 + 500 shipping
  })

  it('POST .../taxes force-recalculates without any other change', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/taxes`, {
      method: 'POST',
      headers: { cookie: cartCookie },
    })
    expect(cart.total).toBe(3800)
  })

  it('DELETE .../line-items/:lineId removes the line; totals fall back to shipping only', async () => {
    const before = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, { headers: { cookie: cartCookie } })
    const lineId = before.cart.items[0].id
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items/${lineId}`, {
      method: 'DELETE',
      headers: { cookie: cartCookie },
    })
    expect(cart.items).toHaveLength(0)
    expect(cart.itemsSubtotal).toBe(0)
    expect(cart.taxTotal).toBe(0)
    expect(cart.total).toBe(500)
  })

  describe('guest -> customer transfer', () => {
    it('POST .../customer 401s with no customer session', async () => {
      await expect(
        $fetch(`/api/store/carts/${cartId}/customer`, { method: 'POST', headers: { cookie: cartCookie } }),
      ).rejects.toMatchObject({ statusCode: 401 })
    })

    it('with a signed-in customer, transfers the cart; the session alone then authorizes it', async () => {
      const signUp = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'cart-buyer@test.pygmalion.dev', password: 'buyer-pw-12345', name: 'Cart Buyer' }),
      })
      const customerCookie = cookiePair(signUp)

      const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/customer`, {
        method: 'POST',
        headers: { cookie: `${cartCookie}; ${customerCookie}` },
      })
      expect(cart.customerId).toBeTruthy()

      // The customer session alone now authorizes access — no cart cookie needed.
      const got = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, { headers: { cookie: customerCookie } })
      expect(got.cart.id).toBe(cartId)
    })
  })
})
