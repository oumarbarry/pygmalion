import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createCategoriesService } from './categories'
import { createProductsService } from './products'

let db: PygmalionDatabase
let categories: ReturnType<typeof createCategoriesService>
let products: ReturnType<typeof createProductsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  categories = createCategoriesService({ db })
  products = createProductsService({ db })
})

describe('categories service', () => {
  it('create returns a prefixed id, auto-slug handle, mpath = own id at top level', async () => {
    const c = await categories.create({ name: 'Electronics' })
    expect(c.id).toMatch(/^pcat_/)
    expect(c.handle).toBe('electronics')
    expect(c.mpath).toBe(c.id)
    // Field defaults: is_active/is_internal both default false.
    expect(c.isActive).toBe(false)
    expect(c.isInternal).toBe(false)
  })

  it('create rejects a blank name (zod)', async () => {
    await expect(categories.create({ name: '' })).rejects.toThrow()
  })

  it('a child mpath is "<parentMpath>.<selfId>"', async () => {
    const parent = await categories.create({ name: 'Parent' })
    const child = await categories.create({ name: 'Child', parentCategoryId: parent.id })
    expect(child.mpath).toBe(`${parent.id}.${child.id}`)
  })

  it('handle is unique among live rows only — soft-delete frees it for reuse', async () => {
    const c = await categories.create({ name: 'Shoes', handle: 'shoes' })
    await expect(categories.create({ name: 'Shoes 2', handle: 'shoes' })).rejects.toThrow()
    await categories.remove(c.id)
    await expect(categories.create({ name: 'Shoes 3', handle: 'shoes' })).resolves.toBeTruthy()
  })

  it('update / get / list round-trip', async () => {
    const c = await categories.create({ name: 'Books' })
    const updated = await categories.update(c.id, { name: 'Books & Media', isActive: true })
    expect(updated?.name).toBe('Books & Media')
    expect(updated?.isActive).toBe(true)
    expect((await categories.get(c.id))?.name).toBe('Books & Media')
    expect((await categories.list({ q: 'media' })).some((row) => row.id === c.id)).toBe(true)
  })

  it('mpath move on 3 levels recomputes descendants', async () => {
    const a = await categories.create({ name: 'A' })
    const b = await categories.create({ name: 'B', parentCategoryId: a.id })
    const c = await categories.create({ name: 'C', parentCategoryId: b.id })
    expect(b.mpath).toBe(`${a.id}.${b.id}`)
    expect(c.mpath).toBe(`${a.id}.${b.id}.${c.id}`)

    const d = await categories.create({ name: 'D' }) // another top-level category
    const moved = await categories.update(b.id, { parentCategoryId: d.id })
    expect(moved?.mpath).toBe(`${d.id}.${b.id}`)
    expect(moved?.parentCategoryId).toBe(d.id)

    // C is a grandchild of the moved subtree — its mpath must be recomputed too.
    const cAfter = await categories.get(c.id)
    expect(cAfter?.mpath).toBe(`${d.id}.${b.id}.${c.id}`)
    // A no longer has B/C under it.
    expect(cAfter?.mpath.startsWith(a.id)).toBe(false)
  })

  it('move to top level (parentCategoryId: null) recalculates mpath to the bare id', async () => {
    const a = await categories.create({ name: 'A' })
    const b = await categories.create({ name: 'B', parentCategoryId: a.id })
    const moved = await categories.update(b.id, { parentCategoryId: null })
    expect(moved?.mpath).toBe(b.id)
    expect(moved?.parentCategoryId).toBeNull()
  })

  it('rejects moving a category under itself', async () => {
    const a = await categories.create({ name: 'A' })
    await expect(categories.update(a.id, { parentCategoryId: a.id })).rejects.toThrow(/own parent/)
  })

  it('rejects moving a category under its own descendant', async () => {
    const a = await categories.create({ name: 'A' })
    const b = await categories.create({ name: 'B', parentCategoryId: a.id })
    await expect(categories.update(a.id, { parentCategoryId: b.id })).rejects.toThrow(/own descendant/)
  })

  it('rejects an unknown parent', async () => {
    await expect(categories.create({ name: 'X', parentCategoryId: 'pcat_nope' })).rejects.toThrow(/parent category not found/)
  })

  it('cascade delete: removing a category soft-deletes its whole descendant subtree', async () => {
    const a = await categories.create({ name: 'A' })
    const b = await categories.create({ name: 'B', parentCategoryId: a.id })
    const c = await categories.create({ name: 'C', parentCategoryId: b.id })

    await categories.remove(a.id)
    expect(await categories.get(a.id)).toBeNull()
    expect(await categories.get(b.id)).toBeNull()
    expect(await categories.get(c.id)).toBeNull()
  })

  it('cascade delete does not touch an unrelated sibling subtree', async () => {
    const a = await categories.create({ name: 'A' })
    const b = await categories.create({ name: 'B', parentCategoryId: a.id })
    const sibling = await categories.create({ name: 'Sibling' })

    await categories.remove(a.id)
    expect(await categories.get(b.id)).toBeNull()
    expect(await categories.get(sibling.id)).toBeTruthy()
  })

  it('internal category is invisible store-side', async () => {
    const active = await categories.create({ name: 'Visible', isActive: true, isInternal: false })
    const internal = await categories.create({ name: 'Internal', isActive: true, isInternal: true })
    const inactive = await categories.create({ name: 'Inactive', isActive: false, isInternal: false })

    const storefrontList = await categories.list({ storefront: true })
    const ids = storefrontList.map((row) => row.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(internal.id)
    expect(ids).not.toContain(inactive.id)

    expect(await categories.getStorefront(active.id)).toBeTruthy()
    expect(await categories.getStorefront(internal.id)).toBeNull()
    expect(await categories.getStorefront(inactive.id)).toBeNull()
  })

  it('add/remove products from a category (many-to-many)', async () => {
    const cat = await categories.create({ name: 'Cat' })
    const p1 = await products.create({ title: 'P1' })
    const p2 = await products.create({ title: 'P2' })

    await categories.updateProducts(cat.id, { add: [p1.id, p2.id] })
    expect((await categories.listProductIds(cat.id)).sort()).toEqual([p1.id, p2.id].sort())

    await categories.updateProducts(cat.id, { remove: [p1.id] })
    expect(await categories.listProductIds(cat.id)).toEqual([p2.id])
  })

  it('storefrontProducts only returns published, non-deleted products', async () => {
    const cat = await categories.create({ name: 'Cat' })
    const published = await products.create({ title: 'Published', status: 'published' })
    const draft = await products.create({ title: 'Draft' })
    await categories.updateProducts(cat.id, { add: [published.id, draft.id] })

    const result = await categories.storefrontProducts(cat.id)
    expect(result.map((p) => p.id)).toEqual([published.id])
  })

  it('subtreeIds(parentId) includes the parent plus every live descendant', async () => {
    const parent = await categories.create({ name: 'Parent' })
    const child = await categories.create({ name: 'Child', parentCategoryId: parent.id })
    const grandchild = await categories.create({ name: 'Grandchild', parentCategoryId: child.id })
    const unrelated = await categories.create({ name: 'Unrelated' })

    const ids = await categories.subtreeIds([parent.id])
    expect(ids.sort()).toEqual([parent.id, child.id, grandchild.id].sort())
    expect(ids).not.toContain(unrelated.id)
  })

  it('a product filed under a sub-category surfaces when the product list is filtered by its parent category', async () => {
    const parent = await categories.create({ name: 'Parent Cat' })
    const child = await categories.create({ name: 'Child Cat', parentCategoryId: parent.id })
    const inChild = await products.create({ title: 'In Child' })
    const unrelated = await products.create({ title: 'Unrelated' })
    await categories.updateProducts(child.id, { add: [inChild.id] })

    const scoped = await products.list({ categoryIds: await categories.subtreeIds([parent.id]) })
    expect(scoped.map((p) => p.id)).toEqual([inChild.id])
    expect(scoped.map((p) => p.id)).not.toContain(unrelated.id)
  })

  it('storefrontProducts(parentId) surfaces published products of descendant categories', async () => {
    const parent = await categories.create({ name: 'Maison' })
    const child = await categories.create({ name: 'Cuisine', parentCategoryId: parent.id })
    const inChild = await products.create({ title: 'Plat', status: 'published' })
    const draftInChild = await products.create({ title: 'Brouillon' })
    await categories.updateProducts(child.id, { add: [inChild.id, draftInChild.id] })
    // linked to BOTH parent and child: must not appear twice
    const inBoth = await products.create({ title: 'Torchon', status: 'published' })
    await categories.updateProducts(parent.id, { add: [inBoth.id] })
    await categories.updateProducts(child.id, { add: [inBoth.id] })

    const result = await categories.storefrontProducts(parent.id)
    expect(result.map((p) => p.id).sort()).toEqual([inChild.id, inBoth.id].sort())
    expect(result).toHaveLength(2)
  })
})
