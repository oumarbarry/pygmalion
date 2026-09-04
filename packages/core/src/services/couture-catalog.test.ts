import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createProductsService } from './products'
import { createTagsService } from './tags'

// Admin catalog needs: readable product images, tag<->product attach/detach.

let db: PygmalionDatabase
let products: ReturnType<typeof createProductsService>
let tags: ReturnType<typeof createTagsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  products = createProductsService({ db })
  tags = createTagsService({ db })
})

describe('product images read (B1)', () => {
  it('lists images in rank order', async () => {
    const p = await products.create({ title: 'Mug' })
    await products.images.add(p.id, { images: [{ url: 'https://a.test/1.png' }, { url: 'https://a.test/2.png' }] })
    const images = await products.images.list(p.id)
    expect(images).toHaveLength(2)
    expect(images.map((i) => i.url)).toEqual(['https://a.test/1.png', 'https://a.test/2.png'])
    expect(images[0].rank).toBeLessThan(images[1].rank)
  })

  it('returns empty for a product without images', async () => {
    const p = await products.create({ title: 'Nu' })
    expect(await products.images.list(p.id)).toEqual([])
  })
})

describe('tag products attach/detach (B4)', () => {
  it('adds idempotently, removes, and reports the resulting membership', async () => {
    const t = await tags.create({ value: 'promo' })
    const p1 = await products.create({ title: 'A' })
    const p2 = await products.create({ title: 'B' })

    const afterAdd = await tags.setProducts(t.id, { add: [p1.id, p2.id] })
    expect(afterAdd.sort()).toEqual([p1.id, p2.id].sort())

    // Idempotent: re-adding does not duplicate.
    const again = await tags.setProducts(t.id, { add: [p1.id] })
    expect(again).toHaveLength(2)

    const afterRemove = await tags.setProducts(t.id, { remove: [p1.id] })
    expect(afterRemove).toEqual([p2.id])
    expect(await tags.listProductIds(t.id)).toEqual([p2.id])
  })
})
