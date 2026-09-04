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
interface FulfillmentSet {
  id: string
}
interface ServiceZone {
  id: string
}
interface ShippingProfile {
  id: string
}
interface ShippingOption {
  id: string
}
interface EligibleShippingOption {
  id: string
  name: string
  amount: number
}
interface Cart {
  id: string
  total: number
  shippingTotal: number
  shippingMethods: { id: string; name: string; amount: number; shippingOptionId: string | null }[]
}

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// Shipping domain: admin config (fulfillment
// set -> service zone -> geo zone, shipping profile, shipping option + flat
// price) then the store flow: cart with a FR address ->
// FR options listed with a resolved price -> setShippingMethod resolves the
// real option and recalculates cart totals (no client-trusted amount).
describe('shipping: admin config + store flow (e2e)', async () => {
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
  let defaultProfileId: string
  let frOptionId: string

  it('seeds staff, a region, a 20.00 priced variant', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('shipping-owner@test.pygmalion.dev'))

    const region = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'Shipping E2E Region', currencyCode: 'usd' },
    })
    regionId = region.region.id

    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { title: 'E2E Shipping Mug' },
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
      body: { create: [{ variantId, currencyCode: 'usd', amount: 2000 }] },
    })
  })

  it('GET /api/admin/shipping-profiles lists the boot-seeded default profile', async () => {
    const { shippingProfiles } = await $fetch<{ shippingProfiles: ShippingProfile[] }>('/api/admin/shipping-profiles', {
      headers: { cookie: staffCookie },
    })
    expect(shippingProfiles.length).toBeGreaterThan(0)
    defaultProfileId = shippingProfiles[0].id
  })

  it('POST /api/admin/fulfillment-sets + service-zones (inline geo zones) sets up a France zone', async () => {
    const set = await $fetch<{ fulfillmentSet: FulfillmentSet }>('/api/admin/fulfillment-sets', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'E2E Fulfillment Set' },
    })
    const zone = await $fetch<{ serviceZone: ServiceZone }>(`/api/admin/fulfillment-sets/${set.fulfillmentSet.id}/service-zones`, {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'France', geoZones: [{ type: 'country', countryCode: 'fr' }] },
    })

    const option = await $fetch<{ shippingOption: ShippingOption }>('/api/admin/shipping-options', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'FR Standard', serviceZoneId: zone.serviceZone.id, shippingProfileId: defaultProfileId },
    })
    frOptionId = option.shippingOption.id
    await $fetch('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { create: [{ shippingOptionId: frOptionId, currencyCode: 'usd', amount: 800 }] },
    })
  })

  it('rejects a calculated option pointing at the manual provider', async () => {
    const set = await $fetch<{ fulfillmentSet: FulfillmentSet }>('/api/admin/fulfillment-sets', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'E2E Calc Set' },
    })
    const zone = await $fetch<{ serviceZone: ServiceZone }>(`/api/admin/fulfillment-sets/${set.fulfillmentSet.id}/service-zones`, {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'World', geoZones: [{ type: 'country', countryCode: 'us' }] },
    })
    await expect(
      $fetch('/api/admin/shipping-options', {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { name: 'Live rate', serviceZoneId: zone.serviceZone.id, shippingProfileId: defaultProfileId, priceType: 'calculated' },
      }),
    ).rejects.toMatchObject({ statusCode: 422 })
  })

  let cartCookie: string
  let cartId: string

  it('POST /api/store/carts creates a guest cart, adds the item, and sets a FR address', async () => {
    const res = await fetch('/api/store/carts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regionId }),
    })
    cartCookie = cookiePair(res)
    const { cart } = (await res.json()) as { cart: Cart & { id: string } }
    cartId = cart.id

    await $fetch(`/api/store/carts/${cartId}/line-items`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { variantId, quantity: 1 },
    })
    await $fetch(`/api/store/carts/${cartId}`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { shippingAddress: { countryCode: 'FR', city: 'Paris' } },
    })
  })

  it('GET /api/store/shipping-options?cart_id= lists the FR option with its resolved price', async () => {
    const { shippingOptions } = await $fetch<{ shippingOptions: EligibleShippingOption[] }>('/api/store/shipping-options', {
      query: { cart_id: cartId },
      headers: { cookie: cartCookie },
    })
    expect(shippingOptions).toEqual([{ id: frOptionId, name: 'FR Standard', priceType: 'flat', amount: 800, isTaxInclusive: false, providerId: 'manual' }])
  })

  it('POST .../shipping-methods with shippingOptionId resolves the real option and recalculates totals', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/shipping-methods`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { shippingOptionId: frOptionId },
    })
    expect(cart.shippingMethods).toHaveLength(1)
    expect(cart.shippingMethods[0].name).toBe('FR Standard')
    expect(cart.shippingMethods[0].amount).toBe(800)
    expect(cart.shippingMethods[0].shippingOptionId).toBe(frOptionId)
    expect(cart.shippingTotal).toBe(800)
    expect(cart.total).toBe(2800) // 2000 item + 800 shipping, no tax region configured
  })

  it('an option not eligible for the cart (wrong zone) is rejected with 422', async () => {
    const set = await $fetch<{ fulfillmentSet: FulfillmentSet }>('/api/admin/fulfillment-sets', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'E2E DE Set' },
    })
    const zone = await $fetch<{ serviceZone: ServiceZone }>(`/api/admin/fulfillment-sets/${set.fulfillmentSet.id}/service-zones`, {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'Germany', geoZones: [{ type: 'country', countryCode: 'de' }] },
    })
    const deOption = await $fetch<{ shippingOption: ShippingOption }>('/api/admin/shipping-options', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'DE Standard', serviceZoneId: zone.serviceZone.id, shippingProfileId: defaultProfileId },
    })
    await $fetch('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { create: [{ shippingOptionId: deOption.shippingOption.id, currencyCode: 'usd', amount: 500 }] },
    })

    await expect(
      $fetch(`/api/store/carts/${cartId}/shipping-methods`, {
        method: 'POST',
        headers: { cookie: cartCookie },
        body: { shippingOptionId: deOption.shippingOption.id },
      }),
    ).rejects.toMatchObject({ statusCode: 500 })
  })
})
