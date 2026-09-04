import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { productTagProduct } from '../schema/taxonomy'
import { createProductsService } from './products'
import { createTagsService } from './tags'

let db: PygmalionDatabase
let tags: ReturnType<typeof createTagsService>
let products: ReturnType<typeof createProductsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  tags = createTagsService({ db })
  products = createProductsService({ db })
})

describe('tags service', () => {
  it('create returns a prefixed id', async () => {
    const t = await tags.create({ value: 'sale' })
    expect(t.id).toMatch(/^ptag_/)
    expect(t.value).toBe('sale')
  })

  it('create rejects a blank value (zod)', async () => {
    await expect(tags.create({ value: '' })).rejects.toThrow()
  })

  it('value is unique among live rows only — soft-delete frees it for reuse', async () => {
    const t = await tags.create({ value: 'new' })
    await expect(tags.create({ value: 'new' })).rejects.toThrow()
    await tags.remove(t.id)
    await expect(tags.create({ value: 'new' })).resolves.toBeTruthy()
  })

  it('update / get / list / soft-delete round-trip', async () => {
    const t = await tags.create({ value: 'eco' })
    const updated = await tags.update(t.id, { value: 'eco-friendly' })
    expect(updated?.value).toBe('eco-friendly')
    expect((await tags.get(t.id))?.value).toBe('eco-friendly')
    expect((await tags.list({ q: 'eco' })).some((row) => row.id === t.id)).toBe(true)

    const removed = await tags.remove(t.id)
    expect(removed?.id).toBe(t.id)
    expect(await tags.get(t.id)).toBeNull()
  })

  it('lists product ids linked to a tag and returns published storefront products only', async () => {
    const t = await tags.create({ value: 'featured' })
    const published = await products.create({ title: 'Published', status: 'published' })
    const draft = await products.create({ title: 'Draft' })
    // Join table populated directly (as product<->tag linking on write happens
    // from the product side); this test only exercises the read path
    // this service owns, mirroring the sales-channels api-key seeding pattern).
    await db.insert(productTagProduct).values([
      { productId: published.id, tagId: t.id },
      { productId: draft.id, tagId: t.id },
    ])

    expect((await tags.listProductIds(t.id)).sort()).toEqual([draft.id, published.id].sort())
    const storefront = await tags.storefrontProducts(t.id)
    expect(storefront.map((p) => p.id)).toEqual([published.id])
  })
})
