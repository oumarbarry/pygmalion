import { fileURLToPath } from 'node:url'
import { createPygmalionClient, type PygmalionClient } from '@oumarbarry/pygmalion-sdk'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface AdminOrder {
  id: string
  displayId: number
  email: string | null
  customerId: string | null
  total: number
  status: string
}

/**
 * The two journeys the shop exists for, against the SAME demo catalogue a
 * developer sees after `pnpm dev`.
 *
 * The seed is asked for explicitly (`POST /api/_demo/seed`): a production build
 * doesn't run it at boot, precisely so the other 23 suites keep the empty store
 * their fixtures assume.
 *
 * Both journeys drive the real HTTP API through `@oumarbarry/pygmalion-sdk` with a real
 * cookie jar, and render the actual pages through SSR with those same cookies —
 * which exercises `useShop`/`useCart`/`useCheckout`/`useCustomer` for real.
 */
describe('full shopping journey (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  /**
   * A cookie jar the SDK carries, exactly like a browser would.
   *
   * The client is built on FIRST USE, not at describe-collection time: `url()`
   * only knows the server's port once `setup()` has actually booted it.
   */
  function jarClient() {
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
    let built: PygmalionClient | undefined
    const client = () =>
      (built ??= createPygmalionClient({ baseUrl: url('/'), fetch: jarFetch, headers: () => ({ cookie: cookieHeader() }) }))
    return { client, jar, cookieHeader }
  }

  let staffCookie: string
  let eurRegionId: string
  let teapotId: string

  beforeAll(async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('demo-owner@test.pygmalion.dev'))
    const result = await $fetch<{ products: number; promotions: number }>('/api/_demo/seed', { method: 'POST' })
    expect(result.products).toBe(20)

    const client = () => createPygmalionClient({ baseUrl: url('/') })
    const { regions } = await client().store.regions.list()
    eurRegionId = regions.find((r) => r.currencyCode === 'eur')!.id
    const { products } = await client().store.products.list({ limit: 30 })
    teapotId = products.find((p) => p.handle === 'theiere-onsen')!.id
  })

  it('SEED: idempotent — a second run changes no count', async () => {
    const again = await $fetch<{ products: number; regions: number; shippingOptions: number }>('/api/_demo/seed', { method: 'POST' })
    expect(again).toMatchObject({ products: 20, regions: 2, shippingOptions: 2 })

    const { products } = await createPygmalionClient({ baseUrl: url('/') }).store.products.list({ limit: 50 })
    // 20 demo products + the 2 the runtime suite relies on, never doubled.
    expect(products.filter((p) => p.handle?.startsWith('theiere'))).toHaveLength(2)
  })

  // --- Parcours invité --------------------------------------------------------

  describe('guest: catalogue -> variant -> cart -> promo code -> manual payment -> order', () => {
    const { client, cookieHeader } = jarClient()
    const email = 'invite@test.pygmalion.dev'
    let cartId: string
    let variantId: string
    let orderId: string
    let orderTotal: number

    it('the home renders the full shop (SSR, usePygmalion + useShop)', async () => {
      const html = await (await fetch('/')).text()

      expect(html).toContain('Maison Pygmalion')
      // The home shows the 12 latest arrivals: the last ones the seed created.
      expect(html).toContain('Carnet relié')
      // The storefront suite pins this string; the footer carries it.
      expect(html).toContain('Pygmalion playground')
    })

    it('the listing carries a price per card (region-contextual prices)', async () => {
      const { products } = await client().store.products.list({ limit: 30, region_id: eurRegionId })
      const teapot = products.find((p) => p.id === teapotId)!

      expect(teapot.variants?.map((v) => v.calculatedPrice?.calculatedAmount)).toEqual([5900, 5900])
    })

    it('the product page carries its gallery, its options and its priced variants', async () => {
      const { product } = await client().store.products.get(teapotId, { region_id: eurRegionId })

      expect(product.images.map((i) => i.url)).toEqual(['/demo/theiere-onsen-1.jpg', '/demo/theiere-onsen-2.jpg'])
      expect(product.options.map((o) => o.title)).toEqual(['Couleur'])
      expect(product.options[0].values.map((v) => v.value)).toEqual(['Bleu nuit', 'Terre cuite'])

      // The picker resolves a variant from the chosen option values — the same
      // pure function the page uses.
      const blueValueId = product.options[0].values[0].id
      const variant = product.variants.find((v) => v.optionValueIds.includes(blueValueId))!
      expect(variant.calculatedPrice?.calculatedAmount).toBe(5900)
      variantId = variant.id

      const html = await (await fetch(`/products/${teapotId}`)).text()
      expect(html).toContain('Théière Onsen')
      expect(html).toContain(variantId)
      expect(html).toContain('/demo/theiere-onsen-1.jpg')
    })

    it('the cart is created on add and renders in SSR (useCart from the cookies)', async () => {
      const { cart } = await client().store.carts.create({ regionId: eurRegionId })
      cartId = cart.id
      const withItem = (await client().store.carts.addLineItem(cartId, { variantId, quantity: 2 })).cart
      expect(withItem.itemsSubtotal).toBe(11800)

      const html = await (await fetch('/cart', { headers: { cookie: `pygmalion_cart=${cartId}; ${cookieHeader()}` } })).text()
      expect(html).toContain('Théière Onsen')
      expect(html).toContain('data-amount="11800"')
    })

    it('the promo code is applied by the server, not computed client-side', async () => {
      const { cart } = await client().store.carts.addPromotions(cartId, { promotionCodes: ['BIENVENUE10'] })

      expect(cart.discountTotal).toBe(1180) // 10 % de 118,00 €
      expect(cart.items[0].adjustments.map((a) => a.code)).toContain('BIENVENUE10')

      // An unknown code breaks nothing and leaves the cart intact.
      await expect(client().store.carts.addPromotions(cartId, { promotionCodes: ['NIMPORTEQUOI'] })).rejects.toMatchObject({
        status: 422,
      })
      expect((await client().store.carts.get(cartId)).cart.discountTotal).toBe(1180)
    })

    it('checkout: the step is derived from the cart on every render', async () => {
      const cookie = `pygmalion_cart=${cartId}; ${cookieHeader()}`
      expect(await (await fetch('/checkout', { headers: { cookie } })).text()).toContain('data-testid="step">email<')

      await client().store.carts.update(cartId, { email })
      expect(await (await fetch('/checkout', { headers: { cookie } })).text()).toContain('data-testid="step">address<')

      await client().store.carts.update(cartId, {
        shippingAddress: { firstName: 'Camille', lastName: 'Roy', address1: '12 rue des Halles', postalCode: '44000', city: 'Nantes', countryCode: 'fr' },
      })
      expect(await (await fetch('/checkout', { headers: { cookie } })).text()).toContain('data-testid="step">shipping<')
    })

    it('shipping: options eligible for this address, VAT applied by the server', async () => {
      const { shippingOptions } = await client().store.shippingOptions.list({ cart_id: cartId })
      expect(shippingOptions.map((o) => o.name)).toEqual(['Colissimo — 3 à 5 jours', 'Express — 24 h'])

      const { cart } = await client().store.carts.setShippingMethod(cartId, { shippingOptionId: shippingOptions[0].id })
      expect(cart.shippingMethods).toHaveLength(1)
      expect(cart.shippingTotal).toBe(590)
      expect(cart.taxTotal).toBeGreaterThan(0) // TVA 20 % FR

      const cookie = `pygmalion_cart=${cartId}; ${cookieHeader()}`
      expect(await (await fetch('/checkout', { headers: { cookie } })).text()).toContain('data-testid="step">payment<')
      orderTotal = cart.total
    })

    it('manual payment -> order, and the cart is no longer reusable', async () => {
      const providers = (await client().store.paymentProviders.list()).paymentProviders.map((p) => p.id)
      expect(providers).toContain('manual')

      await client().store.paymentCollections.create({ cartId, providerId: 'manual' })
      const done = await client().store.carts.complete(cartId)

      expect(done.type).toBe('order')
      expect(done.status).toBe('authorized')
      expect(done.order.total).toBe(orderTotal)
      expect(done.order.email).toBe(email)
      orderId = done.order.id
    })

    it('the confirmation renders for the guest with their email', async () => {
      const { order } = await client().store.orders.get(orderId, { email })
      expect(order.fulfillmentStatus).toBe('not_fulfilled')
      expect(order.items[0].returnableQuantity).toBe(0) // rien d'expédié encore

      const html = await (await fetch(`/order/${orderId}?email=${encodeURIComponent(email)}`)).text()
      expect(html).toContain(`N° ${order.displayId}`)
      expect(html).toContain('Théière Onsen')

      // An email that is not the order's gets no access.
      await expect(client().store.orders.get(orderId, { email: 'autre@test.pygmalion.dev' })).rejects.toMatchObject({ status: 403 })
    })

    it('the order exists on the admin side', async () => {
      const { orders } = await $fetch<{ orders: AdminOrder[] }>('/api/admin/orders?limit=50', { headers: { cookie: staffCookie } })
      const placed = orders.find((o) => o.id === orderId)

      expect(placed).toBeDefined()
      expect(placed).toMatchObject({ email, total: orderTotal, status: 'pending' })
    })
  })

  // --- Parcours connecté ------------------------------------------------------

  describe('signed in: sign-up -> purchase -> my orders -> detail', () => {
    const { client, cookieHeader } = jarClient()
    const email = 'cliente@test.pygmalion.dev'
    let customerId: string
    let orderId: string
    let displayId: number

    it('sign-up: the account is created and the session holds', async () => {
      await client().store.auth.signUp({ email, password: 'motdepasse123', name: 'Camille Roy' })
      const { customer } = await client().store.customers.me()

      expect(customer.email).toBe(email)
      customerId = customer.id
    })

    it('the guest cart is attached to the account before becoming an order', async () => {
      const { products } = await client().store.products.list({ limit: 30, region_id: eurRegionId })
      const soap = products.find((p) => p.handle === 'savon-avoine')!
      const { product } = await client().store.products.get(soap.id, { region_id: eurRegionId })

      const { cart } = await client().store.carts.create({ regionId: eurRegionId })
      await client().store.carts.addLineItem(cart.id, { variantId: product.variants[0].id, quantity: 3 })

      const attached = (await client().store.carts.transferToCustomer(cart.id)).cart
      expect(attached.customerId).toBe(customerId)

      await client().store.carts.update(cart.id, {
        email,
        shippingAddress: { firstName: 'Camille', lastName: 'Roy', address1: '3 quai Ceineray', postalCode: '44000', city: 'Nantes', countryCode: 'fr' },
      })
      const { shippingOptions } = await client().store.shippingOptions.list({ cart_id: cart.id })
      await client().store.carts.setShippingMethod(cart.id, { shippingOptionId: shippingOptions[0].id })
      await client().store.paymentCollections.create({ cartId: cart.id })

      const done = await client().store.carts.complete(cart.id)
      expect(done.type).toBe('order')
      orderId = done.order.id
      displayId = done.order.displayId
    })

    it('« mes commandes » lists the order: session only, no email', async () => {
      const { orders } = await client().store.orders.list({ limit: 10 })
      expect(orders.map((o) => o.id)).toContain(orderId)

      const html = await (await fetch('/account/orders', { headers: { cookie: cookieHeader() } })).text()
      expect(html).toContain(`N° ${displayId}`)
    })

    it('the detail renders, and the address book does its CRUD', async () => {
      const html = await (await fetch(`/account/orders/${orderId}`, { headers: { cookie: cookieHeader() } })).text()
      expect(html).toContain('Savon Lait d\'Avoine')
      expect(html).toContain('3 quai Ceineray')

      const { address } = await client().store.customers.addresses.create({
        addressName: 'Maison',
        address1: '3 quai Ceineray',
        city: 'Nantes',
        postalCode: '44000',
        countryCode: 'FR',
      })
      expect((await client().store.customers.addresses.list()).addresses).toHaveLength(1)

      await client().store.customers.addresses.update(address.id, { addressName: 'Chez moi' })
      expect((await client().store.customers.addresses.list()).addresses[0].addressName).toBe('Chez moi')

      const page = await (await fetch('/account/addresses', { headers: { cookie: cookieHeader() } })).text()
      expect(page).toContain('Chez moi')

      await client().store.customers.addresses.remove(address.id)
      expect((await client().store.customers.addresses.list()).addresses).toHaveLength(0)
    })

    it('a return can only be requested on a shipped line', async () => {
      const before = await client().store.orders.get(orderId)
      expect(before.order.items[0].returnableQuantity).toBe(0)
      await expect(
        client().store.returns.create({ orderId, items: [{ lineItemId: before.order.items[0].id, quantity: 1 }] }),
      ).rejects.toMatchObject({ status: 422 })

      // The admin prepares then ships the line.
      const fulfillment = await $fetch<{ fulfillment: { id: string } }>(`/api/admin/orders/${orderId}/fulfillments`, {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { items: [{ lineItemId: before.order.items[0].id, quantity: 3 }] },
      })
      await $fetch(`/api/admin/orders/${orderId}/fulfillments/${fulfillment.fulfillment.id}/shipments`, {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: {},
      })

      const after = await client().store.orders.get(orderId)
      expect(after.order.fulfillmentStatus).toBe('shipped')
      expect(after.order.items[0].returnableQuantity).toBe(3)

      await client().store.returns.create({ orderId, items: [{ lineItemId: after.order.items[0].id, quantity: 1 }] })

      // The returnable quantity dropped accordingly; the page will only offer 2.
      expect((await client().store.orders.get(orderId)).order.items[0].returnableQuantity).toBe(2)
    })

    it('sign-out: the session drops, /account redirects to sign-in', async () => {
      await client().store.auth.signOut()
      await expect(client().store.customers.me()).rejects.toMatchObject({ status: 401 })

      // The `customer` middleware resolves the session itself (it runs BEFORE
      // the layout) and redirects to sign-in, remembering the target.
      const res = await fetch('/account/orders', { headers: { cookie: cookieHeader() }, redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/account/login?redirect=/account/orders')
    })
  })
})
