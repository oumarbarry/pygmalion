import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createCollectionsService } from './collections'
import { createProductsService } from './products'

let db: PygmalionDatabase
let collections: ReturnType<typeof createCollectionsService>
let products: ReturnType<typeof createProductsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  collections = createCollectionsService({ db })
  products = createProductsService({ db })
})

describe('collections service', () => {
  it('create returns a prefixed id, auto-slug handle', async () => {
    const c = await collections.create({ title: 'Summer Sale' })
    expect(c.id).toMatch(/^pcol_/)
    expect(c.handle).toBe('summer-sale')
  })

  it('create rejects a blank title (zod)', async () => {
    await expect(collections.create({ title: '' })).rejects.toThrow()
  })

  it('handle is unique among live rows only — soft-delete frees it for reuse', async () => {
    const c = await collections.create({ title: 'Summer', handle: 'summer' })
    await expect(collections.create({ title: 'Summer 2', handle: 'summer' })).rejects.toThrow()
    await collections.remove(c.id)
    await expect(collections.create({ title: 'Summer 3', handle: 'summer' })).resolves.toBeTruthy()
  })

  it('update / get / list / soft-delete round-trip', async () => {
    const c = await collections.create({ title: 'Winter' })
    const updated = await collections.update(c.id, { title: 'Winter Sale' })
    expect(updated?.title).toBe('Winter Sale')
    expect((await collections.get(c.id))?.title).toBe('Winter Sale')
    expect((await collections.list({ q: 'winter' })).some((row) => row.id === c.id)).toBe(true)

    const removed = await collections.remove(c.id)
    expect(removed?.id).toBe(c.id)
    expect(await collections.get(c.id)).toBeNull()
  })

  it('adding a product to a collection reassigns it (belongsTo, one collection at a time)', async () => {
    const a = await collections.create({ title: 'A' })
    const b = await collections.create({ title: 'B' })
    const p = await products.create({ title: 'Product' })

    await collections.updateProducts(a.id, { add: [p.id] })
    expect(await collections.listProductIds(a.id)).toEqual([p.id])

    await collections.updateProducts(b.id, { add: [p.id] })
    expect(await collections.listProductIds(b.id)).toEqual([p.id])
    expect(await collections.listProductIds(a.id)).toEqual([])
  })

  it('remove detaches only the products it lists', async () => {
    const c = await collections.create({ title: 'C' })
    const p1 = await products.create({ title: 'P1' })
    const p2 = await products.create({ title: 'P2' })
    await collections.updateProducts(c.id, { add: [p1.id, p2.id] })

    await collections.updateProducts(c.id, { remove: [p1.id] })
    expect(await collections.listProductIds(c.id)).toEqual([p2.id])
  })

  it('storefrontProducts only returns published, non-deleted products', async () => {
    const c = await collections.create({ title: 'D' })
    const published = await products.create({ title: 'Published', status: 'published' })
    const draft = await products.create({ title: 'Draft' })
    await collections.updateProducts(c.id, { add: [published.id, draft.id] })

    const result = await collections.storefrontProducts(c.id)
    expect(result.map((p) => p.id)).toEqual([published.id])
  })
})
