import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Product {
  id: string
}
interface Variant {
  id: string
}
interface PriceList {
  id: string
  status: string
}
interface Price {
  id: string
  amount: number
  priceListId: string | null
}

// Pricing: proves the module.ts/plugin.ts
// wiring end-to-end through real HTTP (admin routes -> pricing service ->
// db), on top of the exhaustive precedence unit tests in
// packages/core/src/services/pricing.test.ts.
describe('pricing: price lists + prices (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  let variantId: string

  it('seeds a staff owner session and a product variant', async () => {
    ;({ cookie } = await seedOwnerSession('pricing-owner@test.pygmalion.dev'))
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Mug' },
    })
    const variant = await $fetch<{ variant: Variant }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Default' },
    })
    variantId = variant.variant.id
    expect(variantId).toMatch(/^variant_/)
  })

  it('POST /api/admin/prices/batch creates a default (non-list) price', async () => {
    const { created } = await $fetch<{ created: Price[] }>('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie },
      body: { create: [{ variantId, currencyCode: 'usd', amount: 1500 }] },
    })
    expect(created).toHaveLength(1)
    expect(created[0].priceListId).toBeNull()
  })

  let priceListId: string

  it('POST /api/admin/price-lists creates a sale list; GET lists it', async () => {
    const created = await $fetch<{ priceList: PriceList }>('/api/admin/price-lists', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Sale', status: 'active', type: 'sale' },
    })
    priceListId = created.priceList.id
    expect(priceListId).toMatch(/^plist_/)
    const list = await $fetch<{ priceLists: PriceList[] }>('/api/admin/price-lists', { headers: { cookie } })
    expect(list.priceLists.some((l) => l.id === priceListId)).toBe(true)
  })

  it('POST /api/admin/price-lists/:id/prices/batch adds a list-scoped price; GET /prices lists it', async () => {
    await $fetch(`/api/admin/price-lists/${priceListId}/prices/batch`, {
      method: 'POST',
      headers: { cookie },
      body: { create: [{ variantId, currencyCode: 'usd', amount: 900 }] },
    })
    const { prices } = await $fetch<{ prices: Price[] }>(`/api/admin/price-lists/${priceListId}/prices`, {
      headers: { cookie },
    })
    expect(prices).toHaveLength(1)
    expect(prices[0].amount).toBe(900)
    expect(prices[0].priceListId).toBe(priceListId)
  })

  it('DELETE /api/admin/price-lists/:id soft-deletes it (subsequent GET 404s)', async () => {
    await $fetch(`/api/admin/price-lists/${priceListId}`, { method: 'DELETE', headers: { cookie } })
    await expect($fetch(`/api/admin/price-lists/${priceListId}`, { headers: { cookie } })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('an unauthenticated request 401s', async () => {
    await expect($fetch('/api/admin/price-lists')).rejects.toMatchObject({ statusCode: 401 })
  })
})
