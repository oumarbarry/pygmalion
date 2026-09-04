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
interface Promotion {
  id: string
  code: string | null
  status: string
}
interface Campaign {
  id: string
  budget: { limitAmount: number | null } | null
}
interface CartLineItem {
  id: string
  discountTotal: number
}
interface Cart {
  id: string
  discountTotal: number
  total: number
  items: CartLineItem[]
}

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('expected a set-cookie header')
  return raw.split(';')[0]
}

// Promotions: store flow (code applied -> totals reduced -> code
// removed) + admin CRUD (promotions/campaigns).
describe('promotions: store + admin (e2e)', async () => {
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

  it('seeds staff, a region, and a 20.00 priced variant', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('promo-owner@test.pygmalion.dev'))

    const region = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { name: 'Promotions E2E Region', currencyCode: 'usd' },
    })
    regionId = region.region.id

    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { title: 'E2E Promo Shirt' },
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

  let promotionId: string

  it('admin: creates a 10% items promotion (CRUD)', async () => {
    const { promotion } = await $fetch<{ promotion: Promotion }>('/api/admin/promotions', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: {
        code: 'SAVE10',
        status: 'active',
        applicationMethod: { target: 'items', allocation: 'each', valueType: 'percentage', value: 10 },
      },
    })
    promotionId = promotion.id
    expect(promotion.code).toBe('SAVE10')
    expect(promotion.status).toBe('active')
  })

  it('admin: lists and reads the promotion back', async () => {
    const { promotions } = await $fetch<{ promotions: Promotion[] }>('/api/admin/promotions', { headers: { cookie: staffCookie } })
    expect(promotions.some((p) => p.id === promotionId)).toBe(true)

    const { promotion } = await $fetch<{ promotion: Promotion }>(`/api/admin/promotions/${promotionId}`, { headers: { cookie: staffCookie } })
    expect(promotion.id).toBe(promotionId)
  })

  it('admin: rule-attribute-options exposes the closed attribute set for the admin UI', async () => {
    const { attributes } = await $fetch<{ attributes: string[] }>('/api/admin/promotions/rule-attribute-options/rules', { headers: { cookie: staffCookie } })
    expect(attributes).toContain('customer_group_id')
  })

  let cartCookie: string
  let cartId: string

  it('store: creates a cart and adds the item — 20.00 baseline, no discount yet', async () => {
    const res = await fetch('/api/store/carts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regionId }),
    })
    cartCookie = cookiePair(res)
    const { cart } = (await res.json()) as { cart: Cart }
    cartId = cart.id

    const added = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { variantId, quantity: 1 },
    })
    expect(added.cart.discountTotal).toBe(0)
    expect(added.cart.total).toBe(2000)
  })

  it('store: applying the code reduces totals by 10%', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/promotions`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { promotionCodes: ['save10'] }, // lower-case on purpose — codes are normalized
    })
    expect(cart.discountTotal).toBe(200)
    expect(cart.total).toBe(1800)
    expect(cart.items[0].discountTotal).toBe(200)
  })

  it('store: an unknown code is rejected with 422', async () => {
    await expect(
      $fetch(`/api/store/carts/${cartId}/promotions`, {
        method: 'POST',
        headers: { cookie: cartCookie },
        body: { promotionCodes: ['NOPE_NOT_REAL'] },
      }),
    ).rejects.toMatchObject({ statusCode: 422 })
  })

  it('store: a later mutation (quantity change) keeps the discount applied, recomputed', async () => {
    const before = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}`, { headers: { cookie: cartCookie } })
    const lineId = before.cart.items[0].id
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/line-items/${lineId}`, {
      method: 'POST',
      headers: { cookie: cartCookie },
      body: { quantity: 2 },
    })
    expect(cart.discountTotal).toBe(400) // 10% of 4000
    expect(cart.total).toBe(3600)
  })

  it('store: removing the code restores the full total', async () => {
    const { cart } = await $fetch<{ cart: Cart }>(`/api/store/carts/${cartId}/promotions`, {
      method: 'DELETE',
      headers: { cookie: cartCookie },
      body: { promotionCodes: ['SAVE10'] },
    })
    expect(cart.discountTotal).toBe(0)
    expect(cart.total).toBe(4000)
  })

  describe('admin: campaigns', () => {
    let campaignId: string

    it('creates a campaign with a nested budget', async () => {
      const { campaign } = await $fetch<{ campaign: Campaign }>('/api/admin/campaigns', {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { name: 'E2E Campaign', budget: { type: 'spend', currencyCode: 'usd', limitAmount: 100000 } },
      })
      campaignId = campaign.id
      expect(campaign.budget?.limitAmount).toBe(100000)
    })

    it('attaches the promotion to the campaign', async () => {
      const { promotions } = await $fetch<{ promotions: Array<{ id: string }> }>(`/api/admin/campaigns/${campaignId}/promotions`, {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { add: [promotionId] },
      })
      expect(promotions.map((p) => p.id)).toEqual([promotionId])
    })

    it('deleting the campaign is a soft delete — GET then 404s', async () => {
      await $fetch(`/api/admin/campaigns/${campaignId}`, { method: 'DELETE', headers: { cookie: staffCookie } })
      await expect($fetch(`/api/admin/campaigns/${campaignId}`, { headers: { cookie: staffCookie } })).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('admin: deleting the promotion is a soft delete — GET then 404s', async () => {
    await $fetch(`/api/admin/promotions/${promotionId}`, { method: 'DELETE', headers: { cookie: staffCookie } })
    await expect($fetch(`/api/admin/promotions/${promotionId}`, { headers: { cookie: staffCookie } })).rejects.toMatchObject({ statusCode: 404 })
  })
})
