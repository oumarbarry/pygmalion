import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Collection {
  id: string
  title: string
  handle: string
}
interface Category {
  id: string
  name: string
  mpath: string
  parentCategoryId: string | null
  isActive: boolean
  isInternal: boolean
}
interface Tag {
  id: string
  value: string
}
interface Product {
  id: string
  title: string
}

// Collections, categories mpath tree, tags:
// admin CRUD, batch product add/remove, mpath recalculation on move (3
// levels), cascade delete, and the store-visibility rule for categories
// (is_active AND NOT is_internal).
describe('taxonomy: collections/categories/tags (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  it('seeds a staff owner session', async () => {
    ;({ cookie } = await seedOwnerSession('taxonomy-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  // --- Collections ------------------------------------------------------------

  it('POST /api/admin/collections creates a collection; GET lists/details it', async () => {
    const created = await $fetch<{ collection: Collection }>('/api/admin/collections', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Summer Sale' },
    })
    expect(created.collection.id).toMatch(/^pcol_/)
    expect(created.collection.handle).toBe('summer-sale')

    const list = await $fetch<{ collections: Collection[] }>('/api/admin/collections', { headers: { cookie } })
    expect(list.collections.some((c) => c.id === created.collection.id)).toBe(true)

    const detail = await $fetch<{ collection: Collection }>(`/api/admin/collections/${created.collection.id}`, {
      headers: { cookie },
    })
    expect(detail.collection.title).toBe('Summer Sale')
  })

  it('batch add/remove products from a collection is visible on the storefront', async () => {
    const collection = await $fetch<{ collection: Collection }>('/api/admin/collections', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Featured' },
    })
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Featured Product', status: 'published' },
    })

    const linked = await $fetch<{ productIds: string[] }>(`/api/admin/collections/${collection.collection.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [product.product.id] },
    })
    expect(linked.productIds).toEqual([product.product.id])

    const storefront = await $fetch<{ products: Product[] }>(
      `/api/store/collections/${collection.collection.id}/products`,
    )
    expect(storefront.products.map((p) => p.id)).toContain(product.product.id)

    const unlinked = await $fetch<{ productIds: string[] }>(`/api/admin/collections/${collection.collection.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { remove: [product.product.id] },
    })
    expect(unlinked.productIds).toEqual([])
  })

  it('DELETE /api/admin/collections/:id soft-deletes it', async () => {
    const collection = await $fetch<{ collection: Collection }>('/api/admin/collections', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'To Delete' },
    })
    await $fetch(`/api/admin/collections/${collection.collection.id}`, { method: 'DELETE', headers: { cookie } })
    await expect(
      $fetch(`/api/admin/collections/${collection.collection.id}`, { headers: { cookie } }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  // --- Categories (mpath tree) -------------------------------------------------

  it('mpath move across 3 levels recomputes the descendants (via HTTP)', async () => {
    const a = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Root A' },
    })
    const b = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Child B', parentCategoryId: a.category.id },
    })
    const c = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Grandchild C', parentCategoryId: b.category.id },
    })
    expect(c.category.mpath).toBe(`${a.category.id}.${b.category.id}.${c.category.id}`)

    const d = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Root D' },
    })
    const moved = await $fetch<{ category: Category }>(`/api/admin/product-categories/${b.category.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { parentCategoryId: d.category.id },
    })
    expect(moved.category.mpath).toBe(`${d.category.id}.${b.category.id}`)

    const cAfter = await $fetch<{ category: Category }>(`/api/admin/product-categories/${c.category.id}`, {
      headers: { cookie },
    })
    expect(cAfter.category.mpath).toBe(`${d.category.id}.${b.category.id}.${c.category.id}`)
  })

  it('cascade delete: deleting a category removes its whole descendant subtree', async () => {
    const parent = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Cascade Parent' },
    })
    const child = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Cascade Child', parentCategoryId: parent.category.id },
    })

    await $fetch(`/api/admin/product-categories/${parent.category.id}`, { method: 'DELETE', headers: { cookie } })

    await expect(
      $fetch(`/api/admin/product-categories/${parent.category.id}`, { headers: { cookie } }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      $fetch(`/api/admin/product-categories/${child.category.id}`, { headers: { cookie } }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('internal category invisible on the store side (is_active AND NOT is_internal)', async () => {
    const visible = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Store Visible', isActive: true, isInternal: false },
    })
    const internal = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Store Internal', isActive: true, isInternal: true },
    })

    // Admin sees both.
    const adminList = await $fetch<{ categories: Category[] }>('/api/admin/product-categories', { headers: { cookie } })
    const adminIds = adminList.categories.map((c) => c.id)
    expect(adminIds).toContain(visible.category.id)
    expect(adminIds).toContain(internal.category.id)

    // Store only sees the non-internal, active one.
    const storeList = await $fetch<{ categories: Category[] }>('/api/store/product-categories')
    const storeIds = storeList.categories.map((c) => c.id)
    expect(storeIds).toContain(visible.category.id)
    expect(storeIds).not.toContain(internal.category.id)

    await expect($fetch(`/api/store/product-categories/${internal.category.id}`)).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect($fetch(`/api/store/product-categories/${visible.category.id}`)).resolves.toBeTruthy()
  })

  it('batch add/remove products from a category is visible on the storefront', async () => {
    const category = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Category Products', isActive: true, isInternal: false },
    })
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Categorized Product', status: 'published' },
    })

    await $fetch(`/api/admin/product-categories/${category.category.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [product.product.id] },
    })

    const storefront = await $fetch<{ products: Product[] }>(
      `/api/store/product-categories/${category.category.id}/products`,
    )
    expect(storefront.products.map((p) => p.id)).toContain(product.product.id)
  })

  // Taxonomy filters on the product listing routes.
  it('GET /api/store/products?category_id[]= filters by category, including sub-category descendants (mpath)', async () => {
    const parent = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Filter Parent', isActive: true, isInternal: false },
    })
    const child = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Filter Child', parentCategoryId: parent.category.id, isActive: true, isInternal: false },
    })
    const inChild = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'In Filter Child', status: 'published' },
    })
    const unrelated = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Unrelated To Filter', status: 'published' },
    })
    await $fetch(`/api/admin/product-categories/${child.category.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [inChild.product.id] },
    })

    // A product filed on the sub-category surfaces when filtering by the
    // parent — store side widens category_id[] to its live descendants.
    const byParent = await $fetch<{ products: Product[] }>(`/api/store/products?category_id[]=${parent.category.id}`)
    expect(byParent.products.map((p) => p.id)).toContain(inChild.product.id)
    expect(byParent.products.map((p) => p.id)).not.toContain(unrelated.product.id)

    // Admin sees the exact category only — no mpath widening.
    const adminByChild = await $fetch<{ products: Product[] }>(
      `/api/admin/products?category_id[]=${child.category.id}`,
      { headers: { cookie } },
    )
    expect(adminByChild.products.map((p) => p.id)).toEqual([inChild.product.id])
  })

  // --- Tags ---------------------------------------------------------------------

  it('POST /api/admin/product-tags creates a tag; GET lists/details it; DELETE soft-deletes', async () => {
    const created = await $fetch<{ tag: Tag }>('/api/admin/product-tags', {
      method: 'POST',
      headers: { cookie },
      body: { value: 'eco-friendly' },
    })
    expect(created.tag.id).toMatch(/^ptag_/)

    const list = await $fetch<{ tags: Tag[] }>('/api/admin/product-tags', { headers: { cookie } })
    expect(list.tags.some((t) => t.id === created.tag.id)).toBe(true)

    const storeDetail = await $fetch<{ tag: Tag }>(`/api/store/product-tags/${created.tag.id}`)
    expect(storeDetail.tag.value).toBe('eco-friendly')

    await $fetch(`/api/admin/product-tags/${created.tag.id}`, { method: 'DELETE', headers: { cookie } })
    await expect($fetch(`/api/admin/product-tags/${created.tag.id}`, { headers: { cookie } })).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
