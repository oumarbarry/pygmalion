import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { productTagProduct } from '../schema/taxonomy'
import type { PygmalionDatabase } from '../db/types'
import { createCategoriesService } from './categories'
import { createCollectionsService } from './collections'
import { createProductsService } from './products'
import { createTagsService } from './tags'

let db: PygmalionDatabase
let products: ReturnType<typeof createProductsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  products = createProductsService({ db })
})

describe('products service', () => {
  it('create returns a prefixed id and defaults to draft', async () => {
    const p = await products.create({ title: 'Red Mug' })
    expect(p.id).toMatch(/^prod_/)
    expect(p.title).toBe('Red Mug')
    expect(p.status).toBe('draft')
    expect(p.handle).toBe('red-mug')
  })

  it('create honours an explicit handle and status', async () => {
    const p = await products.create({ title: 'Blue Mug', handle: 'mug-blue', status: 'published' })
    expect(p.handle).toBe('mug-blue')
    expect(p.status).toBe('published')
  })

  it('get returns a created product, null for unknown', async () => {
    const p = await products.create({ title: 'Cup' })
    expect((await products.get(p.id))?.id).toBe(p.id)
    expect(await products.get('prod_nope')).toBeNull()
  })

  it('list returns all products and paginates without overlap', async () => {
    await products.create({ title: 'A' })
    await products.create({ title: 'B' })
    await products.create({ title: 'C' })
    const all = await products.list({})
    expect(all.map((p) => p.title).sort()).toEqual(['A', 'B', 'C'])
    expect((await products.list({ limit: 2 })).length).toBe(2)
    // Stable order: page 1 (offset 0) and page 2 (offset 2) are disjoint and cover all.
    const page1 = await products.list({ limit: 2, offset: 0 })
    const page2 = await products.list({ limit: 2, offset: 2 })
    expect(page2.length).toBe(1)
    const ids = [...page1, ...page2].map((p) => p.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('list filters by q (title, case-insensitive)', async () => {
    await products.create({ title: 'Red Mug' })
    await products.create({ title: 'Blue Plate' })
    const hits = await products.list({ q: 'mug' })
    expect(hits.map((p) => p.title)).toEqual(['Red Mug'])
  })

  it('create rejects an empty title (zod)', async () => {
    await expect(products.create({ title: '' })).rejects.toThrow()
  })

  // --- Enriched product fields + business rules -----------------------------

  it('create persists the full field set', async () => {
    const p = await products.create({
      title: 'Gift Box',
      subtitle: 'A nice box',
      description: 'Wrap it up',
      status: 'proposed',
      thumbnail: 'thumb.png',
      weight: 1.5,
      length: 10,
      height: 5,
      width: 5,
      originCountry: 'FR',
      hsCode: '1234',
      midCode: '5678',
      material: 'cardboard',
      externalId: 'ext-1',
      metadata: { color: 'red' },
    })
    expect(p.subtitle).toBe('A nice box')
    expect(p.description).toBe('Wrap it up')
    expect(p.status).toBe('proposed')
    expect(p.weight).toBe(1.5)
    expect(p.originCountry).toBe('FR')
    expect(p.hsCode).toBe('1234')
    expect(p.material).toBe('cardboard')
    expect(p.externalId).toBe('ext-1')
    expect(p.metadata).toEqual({ color: 'red' })
    expect(p.isGiftcard).toBe(false)
    expect(p.discountable).toBe(true)
  })

  it('is_giftcard=true forces discountable=false on create, even if discountable=true is also passed', async () => {
    const p = await products.create({ title: 'Gift Card', isGiftcard: true, discountable: true })
    expect(p.isGiftcard).toBe(true)
    expect(p.discountable).toBe(false)
  })

  it('is_giftcard=true forces discountable=false on update, overriding an explicit discountable:true in the same call', async () => {
    const p = await products.create({ title: 'Mug' })
    expect(p.discountable).toBe(true)
    const updated = await products.update(p.id, { isGiftcard: true, discountable: true })
    expect(updated?.isGiftcard).toBe(true)
    expect(updated?.discountable).toBe(false)
  })

  it('flipping an existing giftcard product forces discountable=false even without re-passing isGiftcard', async () => {
    const p = await products.create({ title: 'Voucher', isGiftcard: true })
    expect(p.discountable).toBe(false)
    // Update something unrelated — giftcard rule still holds via current row.
    const updated = await products.update(p.id, { title: 'Voucher v2', discountable: true })
    expect(updated?.discountable).toBe(false)
  })

  it('update supports partial fields and returns null for an unknown id', async () => {
    const p = await products.create({ title: 'Plate' })
    const updated = await products.update(p.id, { subtitle: 'Ceramic' })
    expect(updated?.subtitle).toBe('Ceramic')
    expect(updated?.title).toBe('Plate')
    expect(await products.update('prod_nope', { title: 'x' })).toBeNull()
  })

  it('remove soft-deletes: get() no longer finds it, and the handle is freed for reuse', async () => {
    const p = await products.create({ title: 'Bowl', handle: 'bowl' })
    const removed = await products.remove(p.id)
    expect(removed?.id).toBe(p.id)
    expect(await products.get(p.id)).toBeNull()
    const reused = await products.create({ title: 'Bowl v2', handle: 'bowl' })
    expect(reused.handle).toBe('bowl')
  })

  it('remove is a no-op (returns null) for an already-deleted or unknown id', async () => {
    const p = await products.create({ title: 'Cup 2' })
    await products.remove(p.id)
    expect(await products.remove(p.id)).toBeNull()
    expect(await products.remove('prod_nope')).toBeNull()
  })

  it('get(id, {status}) only returns the product if its status matches', async () => {
    const p = await products.create({ title: 'Hat', status: 'draft' })
    expect(await products.get(p.id, { status: 'published' })).toBeNull()
    expect((await products.get(p.id, { status: 'draft' }))?.id).toBe(p.id)
  })

  it('list filters by status', async () => {
    await products.create({ title: 'Draft One', status: 'draft' })
    await products.create({ title: 'Published One', status: 'published' })
    const published = await products.list({ status: 'published' })
    expect(published.map((p) => p.title)).toEqual(['Published One'])
  })

  it('batch creates, updates and deletes in one call', async () => {
    const existing = await products.create({ title: 'Batch Me' })
    const result = await products.batch({
      create: [{ title: 'Batch New' }],
      update: [{ id: existing.id, title: 'Batch Updated' }],
      delete: [existing.id],
    })
    expect(result.created).toHaveLength(1)
    expect(result.created[0].title).toBe('Batch New')
    expect(result.updated[0].title).toBe('Batch Updated')
    expect(result.deleted).toEqual([existing.id])
    expect(await products.get(existing.id)).toBeNull()
  })
})

describe('products service — taxonomy filters', () => {
  it('list({ collectionIds }) returns only products in that collection', async () => {
    const collections = createCollectionsService({ db })
    const inCollection = await products.create({ title: 'In Collection' })
    const outOfCollection = await products.create({ title: 'Out of Collection' })
    const collection = await collections.create({ title: 'Featured' })
    await collections.updateProducts(collection.id, { add: [inCollection.id] })

    const hits = await products.list({ collectionIds: [collection.id] })
    expect(hits.map((p) => p.id)).toEqual([inCollection.id])
    expect(hits.map((p) => p.id)).not.toContain(outOfCollection.id)
  })

  it('list({ categoryIds }) returns only products in that exact category', async () => {
    const categories = createCategoriesService({ db })
    const inCategory = await products.create({ title: 'In Category' })
    const outOfCategory = await products.create({ title: 'Out of Category' })
    const category = await categories.create({ name: 'Mugs' })
    await categories.updateProducts(category.id, { add: [inCategory.id] })

    const hits = await products.list({ categoryIds: [category.id] })
    expect(hits.map((p) => p.id)).toEqual([inCategory.id])
    expect(hits.map((p) => p.id)).not.toContain(outOfCategory.id)
  })

  it('list({ tagIds }) returns only products carrying that tag', async () => {
    const tags = createTagsService({ db })
    const tagged = await products.create({ title: 'Tagged' })
    const untagged = await products.create({ title: 'Untagged' })
    const tag = await tags.create({ value: 'eco-friendly' })
    await db.insert(productTagProduct).values({ productId: tagged.id, tagId: tag.id })

    const hits = await products.list({ tagIds: [tag.id] })
    expect(hits.map((p) => p.id)).toEqual([tagged.id])
    expect(hits.map((p) => p.id)).not.toContain(untagged.id)
  })
})

describe('products service — variants', () => {
  it('sku is unique globally while live, and is released for reuse after soft-delete', async () => {
    const p1 = await products.create({ title: 'Shirt A' })
    const p2 = await products.create({ title: 'Shirt B' })
    const v1 = await products.variants.create(p1.id, { title: 'Default', sku: 'SKU-1' })
    // Unique across ALL products, not just within one.
    await expect(products.variants.create(p2.id, { title: 'Default', sku: 'SKU-1' })).rejects.toThrow()

    await products.variants.remove(p1.id, v1.id)
    // Soft-delete frees the sku — the same sku can now be reused elsewhere.
    const v2 = await products.variants.create(p2.id, { title: 'Default', sku: 'SKU-1' })
    expect(v2.sku).toBe('SKU-1')
  })

  it('barcode/ean/upc are unique globally while live', async () => {
    const p = await products.create({ title: 'Book' })
    await products.variants.create(p.id, { title: 'V1', barcode: 'BC-1' })
    await expect(products.variants.create(p.id, { title: 'V2', barcode: 'BC-1' })).rejects.toThrow()
  })

  it('a variant must supply exactly one value per product option — no partial combinations', async () => {
    const p = await products.create({ title: 'Tee' })
    const color = await products.options.create(p.id, { title: 'Color', values: [{ value: 'Red' }, { value: 'Blue' }] })
    const size = await products.options.create(p.id, { title: 'Size', values: [{ value: 'S' }, { value: 'M' }] })
    // Only 1 of 2 options covered -> rejected.
    await expect(
      products.variants.create(p.id, { title: 'Bad', optionValueIds: [color.values[0].id] }),
    ).rejects.toThrow()
    // Both covered -> accepted.
    const variant = await products.variants.create(p.id, {
      title: 'Red / S',
      optionValueIds: [color.values[0].id, size.values[0].id],
    })
    expect(variant.optionValueIds.sort()).toEqual([color.values[0].id, size.values[0].id].sort())
  })

  it('two variants of the same product cannot share the exact same option-value combination', async () => {
    const p = await products.create({ title: 'Hoodie' })
    const color = await products.options.create(p.id, { title: 'Color', values: [{ value: 'Black' }] })
    await products.variants.create(p.id, { title: 'Black', optionValueIds: [color.values[0].id] })
    await expect(
      products.variants.create(p.id, { title: 'Black again', optionValueIds: [color.values[0].id] }),
    ).rejects.toThrow()
  })

  it('a product with no options accepts a single variant with no option values, but not two', async () => {
    const p = await products.create({ title: 'Simple' })
    await products.variants.create(p.id, { title: 'Only' })
    await expect(products.variants.create(p.id, { title: 'Only Again' })).rejects.toThrow()
  })

  it('updating a variant to a combination already used by a sibling variant is rejected; updating itself to the same combination is fine', async () => {
    const p = await products.create({ title: 'Cap' })
    const color = await products.options.create(p.id, { title: 'Color', values: [{ value: 'Red' }, { value: 'Blue' }] })
    const red = await products.variants.create(p.id, { title: 'Red', optionValueIds: [color.values[0].id] })
    const blue = await products.variants.create(p.id, { title: 'Blue', optionValueIds: [color.values[1].id] })
    await expect(
      products.variants.update(p.id, blue.id, { optionValueIds: [color.values[0].id] }),
    ).rejects.toThrow()
    const noop = await products.variants.update(p.id, red.id, { optionValueIds: [color.values[0].id] })
    expect(noop?.optionValueIds).toEqual([color.values[0].id])
  })

  it('list/get return variants ordered and null for missing', async () => {
    const p = await products.create({ title: 'Socks' })
    const size = await products.options.create(p.id, { title: 'Size', values: [{ value: 'S' }, { value: 'M' }] })
    await products.variants.create(p.id, { title: 'B', variantRank: 1, optionValueIds: [size.values[1].id] })
    await products.variants.create(p.id, { title: 'A', variantRank: 0, optionValueIds: [size.values[0].id] })
    const list = await products.variants.list(p.id)
    expect(list.map((v) => v.title)).toEqual(['A', 'B'])
    expect(await products.variants.get(p.id, 'variant_nope')).toBeNull()
  })

  it('batch creates/updates/deletes variants for a product', async () => {
    const p = await products.create({ title: 'Batch Variants' })
    const size = await products.options.create(p.id, { title: 'Size', values: [{ value: 'S' }, { value: 'M' }] })
    const existing = await products.variants.create(p.id, { title: 'Old', optionValueIds: [size.values[0].id] })
    const result = await products.variants.batch(p.id, {
      create: [{ title: 'New', optionValueIds: [size.values[1].id] }],
      update: [{ id: existing.id, title: 'Renamed' }],
      delete: [existing.id],
    })
    expect(result.created[0].title).toBe('New')
    expect(result.updated[0].title).toBe('Renamed')
    expect(result.deleted).toEqual([existing.id])
    expect(await products.variants.get(p.id, existing.id)).toBeNull()
  })
})

describe('products service — options', () => {
  it('create/list/update/remove an option and its values', async () => {
    const p = await products.create({ title: 'Vase' })
    const option = await products.options.create(p.id, {
      title: 'Size',
      values: [{ value: 'Small' }, { value: 'Large' }],
    })
    expect(option.values.map((v) => v.value)).toEqual(['Small', 'Large'])

    const list = await products.options.list(p.id)
    expect(list).toHaveLength(1)
    expect(list[0].values).toHaveLength(2)

    const updated = await products.options.update(p.id, option.id, {
      title: 'Size (updated)',
      values: [{ value: 'Small' }, { value: 'Extra Large' }],
    })
    expect(updated?.title).toBe('Size (updated)')
    expect(updated?.values.map((v) => v.value).sort()).toEqual(['Extra Large', 'Small'])

    const removed = await products.options.remove(p.id, option.id)
    expect(removed?.id).toBe(option.id)
    expect(await products.options.list(p.id)).toEqual([])
  })

  it('refuses to remove an option value still referenced by a live variant', async () => {
    const p = await products.create({ title: 'Chair' })
    const option = await products.options.create(p.id, { title: 'Color', values: [{ value: 'Red' }] })
    await products.variants.create(p.id, { title: 'Red', optionValueIds: [option.values[0].id] })
    await expect(products.options.update(p.id, option.id, { title: 'Color', values: [] })).rejects.toThrow()
    await expect(products.options.remove(p.id, option.id)).rejects.toThrow()
  })
})

describe('products service — images', () => {
  it('adds images with auto-assigned rank and auto-sets thumbnail from the first image', async () => {
    const p = await products.create({ title: 'Lamp' })
    expect(p.thumbnail).toBeNull()
    const [img1, img2] = await products.images.add(p.id, {
      images: [{ url: 'files/a.png' }, { url: 'files/b.png' }],
    })
    expect(img1.rank).toBe(0)
    expect(img2.rank).toBe(1)
    const reloaded = await products.get(p.id)
    expect(reloaded?.thumbnail).toBe('files/a.png')
  })

  it('does not override an explicitly-set thumbnail', async () => {
    const p = await products.create({ title: 'Lamp 2', thumbnail: 'files/custom.png' })
    await products.images.add(p.id, { images: [{ url: 'files/a.png' }] })
    const reloaded = await products.get(p.id)
    expect(reloaded?.thumbnail).toBe('files/custom.png')
  })

  it('removes an image', async () => {
    const p = await products.create({ title: 'Lamp 3' })
    const [img] = await products.images.add(p.id, { images: [{ url: 'files/a.png' }] })
    const removed = await products.images.remove(p.id, img.id)
    expect(removed?.id).toBe(img.id)
    expect(await products.images.remove(p.id, img.id)).toBeNull()
  })

  it('links and unlinks images to a variant', async () => {
    const p = await products.create({ title: 'Lamp 4' })
    const v = await products.variants.create(p.id, { title: 'Default' })
    const [img] = await products.images.add(p.id, { images: [{ url: 'files/a.png' }] })
    const linked = await products.variants.setImages(p.id, v.id, { add: [img.id] })
    expect(linked).toEqual([img.id])
    const unlinked = await products.variants.setImages(p.id, v.id, { remove: [img.id] })
    expect(unlinked).toEqual([])
  })
})
