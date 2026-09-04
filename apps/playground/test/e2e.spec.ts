import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Product {
  id: string
  title: string
  status: string
}
interface CapturedEvent {
  event: string
  payload: { id?: string } | null
}

describe('runtime (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    // In-memory DB + fast drain for a clean, quick run.
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  it('serves seeded products from GET /api/store/products', async () => {
    const res = await $fetch<{ products: Product[] }>('/api/store/products')
    expect(res.products.length).toBeGreaterThanOrEqual(2)
    expect(res.products.map((p) => p.title)).toContain('Seed Mug')
  })

  it('created the hook-added demo_notes table at boot', async () => {
    const res = await $fetch<{ tables: string[] }>('/api/_demo/schema-tables')
    expect(res.tables).toContain('products')
    expect(res.tables).toContain('outbox')
    expect(res.tables).toContain('demo_notes')
  })

  it('serves the module-declared route reading the module-declared table', async () => {
    const res = await $fetch<{ notes: { id: string }[] }>('/api/store/demo-notes')
    expect(Array.isArray(res.notes)).toBe(true)
  })

  it('POST /api/admin/products emits product.created, drained to a handler', async () => {
    // /api/admin/** requires staff auth.
    const { cookie } = await seedOwnerSession('products-owner@test.pygmalion.dev')
    const created = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Widget' },
    })
    expect(created.product.id).toMatch(/^prod_/)

    const delivered = (events: CapturedEvent[]) =>
      events.some((e) => e.event === 'product.created' && e.payload?.id === created.product.id)

    let events: CapturedEvent[] = []
    for (let i = 0; i < 50; i++) {
      events = (await $fetch<{ events: CapturedEvent[] }>('/api/_demo/events')).events
      if (delivered(events)) break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(delivered(events)).toBe(true)
  })

  it('returns 404 for an unknown product', async () => {
    await expect($fetch('/api/store/products/prod_missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
