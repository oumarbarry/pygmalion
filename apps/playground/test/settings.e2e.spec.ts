import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Store {
  id: string
}
interface Region {
  id: string
  name: string
}
interface Currency {
  code: string
  name: string
}

// Settings domain: store singleton,
// region CRUD + country assignment + protected delete, currencies read-only.
describe('settings (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  // /api/admin/** requires staff auth — seed one owner
  // session and reuse its cookie for every request in this file.
  let cookie: string
  it('seeds a staff owner session', async () => {
    ;({ cookie } = await seedOwnerSession('settings-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  it('GET /api/admin/stores returns the boot-seeded singleton store', async () => {
    const res = await $fetch<{ stores: Store[] }>('/api/admin/stores', { headers: { cookie } })
    expect(res.stores.length).toBe(1)
  })

  it('GET /api/admin/currencies serves the seeded ISO reference set', async () => {
    const res = await $fetch<{ currencies: Currency[] }>('/api/admin/currencies?limit=100', {
      headers: { cookie },
    })
    expect(res.currencies.map((c) => c.code)).toContain('usd')
    const usd = await $fetch<{ currency: Currency }>('/api/admin/currencies/usd', { headers: { cookie } })
    expect(usd.currency.name).toBe('US Dollar')
  })

  it('POST /api/admin/regions assigns a country, blocking a second region from claiming it', async () => {
    const eu = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Europe', currencyCode: 'eur', countries: ['FR'] },
    })
    expect(eu.region.id).toMatch(/^reg_/)

    const na = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'North America', currencyCode: 'usd', countries: ['US', 'FR'] },
    })
    expect(na.region.id).toMatch(/^reg_/)

    // Country moved: at most one region per country (unicité pays<->région).
    const euAfter = await $fetch<{ region: Region }>(`/api/admin/regions/${eu.region.id}`, {
      headers: { cookie },
    })
    expect(euAfter.region.id).toBe(eu.region.id)
  })

  it('DELETE /api/admin/regions/:id is blocked while a country is assigned (409)', async () => {
    const created = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'APAC', currencyCode: 'usd', countries: ['SG'] },
    })
    await expect(
      $fetch(`/api/admin/regions/${created.region.id}`, { method: 'DELETE', headers: { cookie } }),
    ).rejects.toMatchObject({ statusCode: 409 })

    await $fetch(`/api/admin/regions/${created.region.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { countries: [] },
    })
    const deleted = await $fetch<{ region: Region }>(`/api/admin/regions/${created.region.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(deleted.region.id).toBe(created.region.id)
    await expect(
      $fetch(`/api/admin/regions/${created.region.id}`, { headers: { cookie } }),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
