import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface SalesChannel {
  id: string
  name: string
}
interface Product {
  id: string
  title: string
}
interface CreatedApiKey {
  id: string
  key: string
  prefix: string | null
}

// Sales channels + publishable api-keys:
// channel CRUD, channel<->product scoping, publishable key<->channel
// scoping, store product listing filtered by the resolved channel(s).
describe('sales channels + api keys (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  it('seeds a staff owner session', async () => {
    ;({ cookie } = await seedOwnerSession('channels-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  it('POST /api/admin/sales-channels creates a channel; GET lists it', async () => {
    const created = await $fetch<{ salesChannel: SalesChannel }>('/api/admin/sales-channels', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Web' },
    })
    expect(created.salesChannel.id).toMatch(/^sc_/)
    const list = await $fetch<{ salesChannels: SalesChannel[] }>('/api/admin/sales-channels', {
      headers: { cookie },
    })
    expect(list.salesChannels.some((c) => c.id === created.salesChannel.id)).toBe(true)
  })

  it('GET /api/store/products with no key falls back to the store default channel (dev-permissive, no 401)', async () => {
    await expect($fetch('/api/store/products')).resolves.toBeTruthy()
  })

  it('an unknown publishable key 401s', async () => {
    await expect(
      $fetch('/api/store/products', { headers: { 'x-publishable-api-key': 'pk_not-a-real-key' } }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('a product outside a scoped publishable key channel is invisible on the storefront; revoking the key 401s it', async () => {
    const channelA = await $fetch<{ salesChannel: SalesChannel }>('/api/admin/sales-channels', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Channel A' },
    })
    const channelB = await $fetch<{ salesChannel: SalesChannel }>('/api/admin/sales-channels', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Channel B' },
    })
    // The store only ever lists published products, so both fixtures
    // must be published so this test still isolates the channel-scoping rule.
    const productIn = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Visible In A', status: 'published' },
    })
    const productOut = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Visible In B Only', status: 'published' },
    })
    await $fetch(`/api/admin/sales-channels/${channelA.salesChannel.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [productIn.product.id] },
    })
    await $fetch(`/api/admin/sales-channels/${channelB.salesChannel.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [productOut.product.id] },
    })

    const keyRes = await $fetch<{ apiKey: CreatedApiKey }>('/api/admin/api-keys', {
      method: 'POST',
      headers: { cookie },
      body: { type: 'publishable', name: 'storefront', salesChannelIds: [channelA.salesChannel.id] },
    })
    const key = keyRes.apiKey
    expect(key.prefix).toBe('pk_')
    expect(key.key).toMatch(/^pk_/)

    // Scoped: the product in channel A is visible, the one only in channel B is not.
    const storefront = await $fetch<{ products: Product[] }>('/api/store/products', {
      headers: { 'x-publishable-api-key': key.key },
    })
    expect(storefront.products.map((p) => p.id)).toContain(productIn.product.id)
    expect(storefront.products.map((p) => p.id)).not.toContain(productOut.product.id)

    // Revoke -> 401, even though the raw key string is otherwise unchanged.
    await $fetch(`/api/admin/api-keys/${key.id}/revoke`, { method: 'POST', headers: { cookie } })
    await expect(
      $fetch('/api/store/products', { headers: { 'x-publishable-api-key': key.key } }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('POST /api/admin/api-keys/:id/sales-channels batch-links a publishable key to another channel', async () => {
    const channel = await $fetch<{ salesChannel: SalesChannel }>('/api/admin/sales-channels', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Marketplace' },
    })
    const keyRes = await $fetch<{ apiKey: CreatedApiKey }>('/api/admin/api-keys', {
      method: 'POST',
      headers: { cookie },
      body: { type: 'publishable', name: 'link-test' },
    })
    const linked = await $fetch<{ salesChannelIds: string[] }>(
      `/api/admin/api-keys/${keyRes.apiKey.id}/sales-channels`,
      { method: 'POST', headers: { cookie }, body: { add: [channel.salesChannel.id] } },
    )
    expect(linked.salesChannelIds).toEqual([channel.salesChannel.id])
  })
})
