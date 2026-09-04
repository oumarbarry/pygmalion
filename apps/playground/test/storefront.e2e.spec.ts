import { fileURLToPath } from 'node:url'
import { createPygmalionClient, PygmalionError } from '@oumarbarry/pygmalion-sdk'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Id {
  id: string
}

/**
 * The storefront, end to end, through `@oumarbarry/pygmalion-sdk` and the
 * composables built on it:
 *  - the shopper flow (catalogue -> cart -> checkout manual -> order) is driven
 *    by the SDK against the real server, over real HTTP, with a real cookie jar;
 *  - the pages (`/`, `/products/:id`, `/cart`, `/checkout`) are rendered by the
 *    server with those same cookies, which exercises `usePygmalion` (SSR path),
 *    `useCart` and `useCheckout` for real — no browser needed for the read side.
 */
describe('storefront: SDK + composables (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  // A cookie jar the SDK carries: `POST /api/store/carts` answers with the
  // httpOnly cart token, exactly like a browser would keep it.
  const jar = new Map<string, string>()
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const jarFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const res = await globalThis.fetch(input, init)
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const [name, ...rest] = pair.split('=')
      jar.set(name.trim(), rest.join('='))
    }
    return res
  }

  let client: ReturnType<typeof createPygmalionClient>
  let staffCookie: string
  let regionId: string
  let productId: string
  let variantId: string
  let cartId: string

  it('seeds a region, a published 10.00 product and 10 units of stock', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('storefront-owner@test.pygmalion.dev'))
    client = createPygmalionClient({ baseUrl: url('/'), fetch: jarFetch, headers: () => ({ cookie: cookieHeader() }) })

    regionId = (
      await $fetch<{ region: Id }>('/api/admin/regions', {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { name: 'Storefront Region', currencyCode: 'usd' },
      })
    ).region.id

    productId = (
      await $fetch<{ product: Id }>('/api/admin/products', {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { title: 'Storefront Mug', handle: 'storefront-mug', status: 'published' },
      })
    ).product.id
    variantId = (
      await $fetch<{ variant: Id }>(`/api/admin/products/${productId}/variants`, {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { title: 'Default' },
      })
    ).variant.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { create: [{ variantId, currencyCode: 'usd', amount: 1000 }] },
    })

    const location = await $fetch<{ stockLocation: Id }>('/api/admin/stock-locations', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'Storefront Main' },
    })
    const inventoryItem = (
      await $fetch<{ inventoryItem: Id }>('/api/admin/inventory-items', {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { sku: 'STOREFRONT-MUG' },
      })
    ).inventoryItem.id
    await $fetch(`/api/admin/inventory-items/${inventoryItem}/variants`, {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { variantId },
    })
    await $fetch(`/api/admin/inventory-items/${inventoryItem}/location-levels/${location.stockLocation.id}`, {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { stockedQuantity: 10 },
    })
  })

  it('SDK: reads the catalogue with its priced variants', async () => {
    const { products } = await client.store.products.list()
    expect(products.map((p) => p.title)).toContain('Storefront Mug')

    const { product } = await client.store.products.get(productId, { region_id: regionId })
    expect(product.variants[0].id).toBe(variantId)
    expect(product.variants[0].calculatedPrice?.calculatedAmount).toBe(1000)
  })

  it('SDK: builds a guest cart (token kept in the jar, like a browser)', async () => {
    const { cart } = await client.store.carts.create({ regionId })
    cartId = cart.id
    expect(jar.get('pygmalion_cart_token')).toBe(cart.token)

    const withItem = (await client.store.carts.addLineItem(cartId, { variantId, quantity: 2 })).cart
    expect(withItem.items).toHaveLength(1)
    expect(withItem.itemsSubtotal).toBe(2000)
  })

  it('renders / with the SSR client (usePygmalion), products included', async () => {
    const html = await (await fetch('/')).text()

    expect(html).toContain('Pygmalion playground')
    expect(html).toContain('Storefront Mug')
  })

  it('renders /products/:id with the variant and its price', async () => {
    const html = await (await fetch(`/products/${productId}`)).text()

    expect(html).toContain('Storefront Mug')
    expect(html).toContain(variantId)
  })

  it('renders /cart from the cookies alone (useCart through SSR)', async () => {
    const html = await (await fetch('/cart', { headers: { cookie: `pygmalion_cart=${cartId}; ${cookieHeader()}` } })).text()

    expect(html).toContain('Storefront Mug')
    expect(html).toContain('data-testid="cart-total"')
    expect(html).toContain('2000') // 2 x 10.00, no tax configured for this region
  })

  it('renders /checkout on the step derived from the cart (useCheckout)', async () => {
    const cookie = `pygmalion_cart=${cartId}; ${cookieHeader()}`
    const before = await (await fetch('/checkout', { headers: { cookie } })).text()
    expect(before).toContain('data-testid="step">email<')

    await client.store.carts.update(cartId, {
      email: 'shopper@test.pygmalion.dev',
      shippingAddress: { countryCode: 'US', city: 'Austin' },
    })

    const after = await (await fetch('/checkout', { headers: { cookie } })).text()
    expect(after).toContain('data-testid="step">shipping<')
  })

  it('SDK: shipping option, manual payment session, complete -> order', async () => {
    const { shippingOptions } = await client.store.shippingOptions.list({ cart_id: cartId })
    if (shippingOptions.length) {
      await client.store.carts.setShippingMethod(cartId, { shippingOptionId: shippingOptions[0].id })
    }

    const { paymentCollection } = await client.store.paymentCollections.create({ cartId })
    expect(paymentCollection.amount).toBeGreaterThan(0)

    const done = await client.store.carts.complete(cartId)
    expect(done.type).toBe('order')
    expect(done.status).toBe('authorized')
    expect(done.order.total).toBe(2000)

    // The guest reads its own order back with the email that placed it.
    const { order } = await client.store.orders.get(done.order.id, { email: 'shopper@test.pygmalion.dev' })
    expect(order.id).toBe(done.order.id)
  })

  it('SDK: surfaces API errors as a typed PygmalionError', async () => {
    const err = await client.store.products.get('prod_does_not_exist').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PygmalionError)
    expect(err).toMatchObject({ status: 404 })
  })

  it('SDK: an admin api key authenticates the admin surface (x-api-key)', async () => {
    const created = await $fetch<{ apiKey: { key: string } }>('/api/admin/api-keys', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'sdk-e2e', type: 'secret' },
    })
    const admin = createPygmalionClient({ baseUrl: url('/'), apiKey: created.apiKey.key })

    const { products } = await admin.admin.products.list({ q: 'Storefront' })
    expect(products.map((p) => p.title)).toContain('Storefront Mug')

    const anonymous = createPygmalionClient({ baseUrl: url('/') })
    await expect(anonymous.admin.products.list()).rejects.toMatchObject({ status: 401 })
  })
})
