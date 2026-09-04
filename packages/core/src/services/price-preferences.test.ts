import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createPricePreferencesService } from './price-preferences'

let db: PygmalionDatabase
let pricePreferences: ReturnType<typeof createPricePreferencesService>

beforeEach(async () => {
  db = await createTestDb(schema)
  pricePreferences = createPricePreferencesService({ db })
})

describe('price preferences service', () => {
  it('create returns a prefixed id and defaults isTaxInclusive to false', async () => {
    const p = await pricePreferences.create({ attribute: 'region_id', value: 'reg_1' })
    expect(p.id).toMatch(/^prpref_/)
    expect(p.isTaxInclusive).toBe(false)
  })

  it('rejects an attribute outside region_id/currency_code', async () => {
    // @ts-expect-error deliberately invalid attribute for the runtime check
    await expect(pricePreferences.create({ attribute: 'nope', value: 'x' })).rejects.toThrow()
  })

  it('enforces unique (attribute, value) among live rows', async () => {
    await pricePreferences.create({ attribute: 'currency_code', value: 'usd', isTaxInclusive: true })
    await expect(pricePreferences.create({ attribute: 'currency_code', value: 'usd' })).rejects.toThrow()
  })

  it('soft-delete frees the (attribute, value) pair for reuse', async () => {
    const p = await pricePreferences.create({ attribute: 'currency_code', value: 'usd' })
    await pricePreferences.remove(p.id)
    const recreated = await pricePreferences.create({ attribute: 'currency_code', value: 'usd' })
    expect(recreated.id).not.toBe(p.id)
  })

  it('update toggles isTaxInclusive', async () => {
    const p = await pricePreferences.create({ attribute: 'region_id', value: 'reg_1' })
    const updated = await pricePreferences.update(p.id, { isTaxInclusive: true })
    expect(updated?.isTaxInclusive).toBe(true)
  })

  it('list/get filter out soft-deleted rows', async () => {
    const p = await pricePreferences.create({ attribute: 'region_id', value: 'reg_2' })
    await pricePreferences.remove(p.id)
    expect(await pricePreferences.get(p.id)).toBeNull()
    expect((await pricePreferences.list({})).map((r) => r.id)).not.toContain(p.id)
  })
})
