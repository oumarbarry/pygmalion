import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'

let db: PygmalionDatabase
let currencies: ReturnType<typeof createCurrenciesService>

beforeEach(async () => {
  db = await createTestDb(schema)
  currencies = createCurrenciesService({ db })
})

describe('currencies service', () => {
  it('seed loads the ISO reference set (usd present, correct decimal digits)', async () => {
    await currencies.seed()
    const usd = await currencies.get('usd')
    expect(usd?.name).toBe('US Dollar')
    expect(usd?.decimalDigits).toBe(2)
    const jpy = await currencies.get('jpy')
    expect(jpy?.decimalDigits).toBe(0)
  })

  it('seed is idempotent (safe to call twice, no duplicate error)', async () => {
    await currencies.seed()
    await expect(currencies.seed()).resolves.toBeUndefined()
    const all = await currencies.list({ limit: 1000 })
    const usdCount = all.filter((c) => c.code === 'usd').length
    expect(usdCount).toBe(1)
  })

  it('get is case-insensitive on code and returns null for unknown', async () => {
    await currencies.seed()
    expect((await currencies.get('USD'))?.code).toBe('usd')
    expect(await currencies.get('xxx')).toBeNull()
  })

  it('list filters by q (name or code)', async () => {
    await currencies.seed()
    const hits = await currencies.list({ q: 'yen' })
    expect(hits.map((c) => c.code)).toEqual(['jpy'])
  })

  it('list paginates without overlap', async () => {
    await currencies.seed()
    const page1 = await currencies.list({ limit: 5, offset: 0 })
    const page2 = await currencies.list({ limit: 5, offset: 5 })
    expect(page1.length).toBe(5)
    const ids = [...page1, ...page2].map((c) => c.code)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
