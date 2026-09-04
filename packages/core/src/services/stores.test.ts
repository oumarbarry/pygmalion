import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createStoresService } from './stores'

let db: PygmalionDatabase
let stores: ReturnType<typeof createStoresService>
let currencies: ReturnType<typeof createCurrenciesService>

beforeEach(async () => {
  db = await createTestDb(schema)
  stores = createStoresService({ db })
  currencies = createCurrenciesService({ db })
  await currencies.seed()
})

describe('stores service', () => {
  it('get returns null before ensure() has run', async () => {
    expect(await stores.get()).toBeNull()
  })

  it('ensure creates the singleton store once, idempotently', async () => {
    const a = await stores.ensure()
    const b = await stores.ensure()
    expect(a.id).toBe(b.id)
    expect(a.id).toMatch(/^store_/)
    expect((await stores.list()).length).toBe(1)
  })

  it('a second store row is rejected at the DB level (singleton unique index)', async () => {
    await stores.ensure()
    await expect(
      db.insert(schema.stores).values({ id: 'store_extra' }),
    ).rejects.toThrow()
  })

  it('update patches fields and bumps updatedAt', async () => {
    const store = await stores.ensure()
    const updated = await stores.update(store.id, { name: 'My Shop' })
    expect(updated?.name).toBe('My Shop')
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(store.updatedAt.getTime())
  })

  it('setSupportedCurrencies replaces the set and enforces exactly one default', async () => {
    const store = await stores.ensure()
    const rows = await stores.setSupportedCurrencies(store.id, [{ code: 'usd' }, { code: 'eur', isDefault: true }])
    expect(rows.length).toBe(2)
    expect(rows.find((r) => r.isDefault)?.currencyCode).toBe('eur')

    // Replacing again drops the old set entirely.
    const rows2 = await stores.setSupportedCurrencies(store.id, [{ code: 'gbp' }])
    expect(rows2.map((r) => r.currencyCode)).toEqual(['gbp'])
    expect(rows2[0].isDefault).toBe(true) // sole entry defaults automatically
  })

  it('setSupportedCurrencies rejects more than one default', async () => {
    const store = await stores.ensure()
    await expect(
      stores.setSupportedCurrencies(store.id, [
        { code: 'usd', isDefault: true },
        { code: 'eur', isDefault: true },
      ]),
    ).rejects.toThrow(/one supported currency/)
  })
})
