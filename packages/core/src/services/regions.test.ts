import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { regionCountries, regions as regionsTable } from '../schema/settings'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'

let db: PygmalionDatabase
let regions: ReturnType<typeof createRegionsService>
let currencies: ReturnType<typeof createCurrenciesService>

beforeEach(async () => {
  db = await createTestDb(schema)
  regions = createRegionsService({ db })
  currencies = createCurrenciesService({ db })
  await currencies.seed()
  await regions.seedCountries()
})

describe('regions service', () => {
  it('create returns a prefixed id and defaults', async () => {
    const r = await regions.create({ name: 'Europe', currencyCode: 'eur' })
    expect(r.id).toMatch(/^reg_/)
    expect(r.automaticTaxes).toBe(true)
  })

  it('create assigns countries; a country belongs to at most one region', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur', countries: ['fr', 'de'] })
    expect((await regions.countries(eu.id)).map((c) => c.iso2).sort()).toEqual(['DE', 'FR'])

    // Re-assigning FR to a new region moves it — never two regions at once.
    const na = await regions.create({ name: 'North America', currencyCode: 'usd', countries: ['US'] })
    await regions.update(na.id, { countries: ['US', 'FR'] })
    expect((await regions.countries(eu.id)).map((c) => c.iso2)).toEqual(['DE'])
    expect((await regions.countries(na.id)).map((c) => c.iso2).sort()).toEqual(['FR', 'US'])
  })

  it('create rejects an unknown country code', async () => {
    await expect(regions.create({ name: 'Nowhere', currencyCode: 'usd', countries: ['ZZ'] })).rejects.toThrow(
      /unknown country/,
    )
  })

  it('update replaces the country set (unassigns countries no longer listed)', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur', countries: ['FR', 'DE'] })
    await regions.update(eu.id, { countries: ['FR'] })
    expect((await regions.countries(eu.id)).map((c) => c.iso2)).toEqual(['FR'])
  })

  it('remove is blocked while countries are assigned (protected delete)', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur', countries: ['FR'] })
    await expect(regions.remove(eu.id)).rejects.toThrow(/countries assigned/)
    expect(await regions.get(eu.id)).not.toBeNull()
  })

  it('remove soft-deletes once countries are cleared', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur', countries: ['FR'] })
    await regions.update(eu.id, { countries: [] })
    const removed = await regions.remove(eu.id)
    expect(removed?.deletedAt).not.toBeNull()
    expect(await regions.get(eu.id)).toBeNull()
  })

  it('DB-level FK RESTRICT blocks a hard delete of a region with countries assigned', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur', countries: ['FR'] })
    await expect(db.delete(regionsTable).where(eq(regionsTable.id, eu.id))).rejects.toThrow()
  })

  it('list/get filter out soft-deleted regions', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur' })
    await regions.remove(eu.id)
    expect(await regions.get(eu.id)).toBeNull()
    expect((await regions.list({})).map((r) => r.id)).not.toContain(eu.id)
  })

  it('seedCountries is idempotent and does not clobber an assignment', async () => {
    const eu = await regions.create({ name: 'Europe', currencyCode: 'eur', countries: ['FR'] })
    await regions.seedCountries()
    expect((await regions.countries(eu.id)).map((c) => c.iso2)).toEqual(['FR'])
    const all = await db.select().from(regionCountries)
    expect(all.filter((c) => c.iso2 === 'FR').length).toBe(1)
  })
})
