import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Product { id: string; title: string; status: string; thumbnail: string | null }
interface Option { id: string; title: string; values: { id: string; value: string }[] }
interface Variant { id: string; title: string; sku: string | null }
interface Collection { id: string }
interface Category { id: string; name: string; mpath: string; parentCategoryId: string | null }
interface StockLocation { id: string }
interface InventoryItem { id: string; sku: string | null }
interface LocationLevel { locationId: string; stocked: number; reserved: number; available: number }
interface SalesChannel { id: string }
interface StoreVariant { id: string; calculatedPrice: { calculatedAmount: number | null; calculatedPriceId: string | null } | null }
interface PricePreference { id: string; isTaxInclusive: boolean }
interface Upload { id: string; url: string }

/**
 * The admin *screens* of the Produits section, exercised as flows
 * rather than as routes (the routes themselves are covered by catalog /
 * taxonomy / inventory / pricing e2e). Each test replays the exact call
 * sequence one screen performs, in order, so a screen that silently stops
 * matching the API fails here.
 *
 * Same style as the other suites: HTTP against a booted playground, no
 * browser (a rendering test would be a pixel test).
 */
describe('admin catalogue screens (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  let productId: string
  let variantIds: string[] = []
  let locationId: string
  let inventoryItemId: string

  it('signs a staff owner in (the sign-in screen)', async () => {
    ;({ cookie } = await seedOwnerSession('catalog-screens-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  it('the créer-un-produit wizard writes product -> options -> déclinaisons -> prix -> stock -> canaux', async () => {
    // Step « Le stock » needs somewhere to count, step « Où le vendre » needs
    // a storefront — both are picked, not created, by the wizard.
    const location = await $fetch<{ stockLocation: StockLocation }>('/api/admin/stock-locations', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Boutique principale' },
    })
    locationId = location.stockLocation.id

    // The wizard *picks* a storefront, it never creates one — and creating a
    // second channel would flip the store list into channel-scoped mode
    // (`hasMultipleChannels`), which is a different behaviour than the one the
    // screen relies on.
    const channels = await $fetch<{ salesChannels: SalesChannel[] }>('/api/admin/sales-channels', {
      headers: { cookie },
    })
    const channelId = channels.salesChannels[0]?.id ?? (await $fetch<{ salesChannel: SalesChannel }>(
      '/api/admin/sales-channels',
      { method: 'POST', headers: { cookie }, body: { name: 'Ma boutique' } },
    )).salesChannel.id

    // 1. Le produit — created as a draft, published by the summary screen.
    const created = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Chemise en lin', description: 'Coupe droite', isGiftcard: false, status: 'draft' },
    })
    productId = created.product.id
    expect(productId).toMatch(/^prod_/)

    // 3. Les déclinaisons — one option, two values, so two déclinaisons.
    const option = await $fetch<{ option: Option }>(`/api/admin/products/${productId}/options`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Taille', values: [{ value: 'S' }, { value: 'M' }] },
    })
    expect(option.option.values).toHaveLength(2)

    for (const value of option.option.values) {
      const variant = await $fetch<{ variant: Variant }>(`/api/admin/products/${productId}/variants`, {
        method: 'POST',
        headers: { cookie },
        body: {
          title: value.value,
          sku: `chemise-en-lin-${value.value.toLowerCase()}`,
          optionValueIds: [value.id],
        },
      })
      variantIds.push(variant.variant.id)
    }
    expect(variantIds).toHaveLength(2)

    // 4. Le prix — one amount per currency, in minor units.
    const priced = await $fetch<{ created: { id: string }[] }>('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie },
      body: { create: variantIds.map((variantId) => ({ variantId, currencyCode: 'usd', amount: 4990 })) },
    })
    expect(priced.created).toHaveLength(2)

    // 5. Le stock — a fresh déclinaison has no inventory item yet: create it,
    // link it to the déclinaison, then count it at the chosen place.
    const item = await $fetch<{ inventoryItem: InventoryItem }>('/api/admin/inventory-items', {
      method: 'POST',
      headers: { cookie },
      body: { sku: 'chemise-en-lin-s' },
    })
    inventoryItemId = item.inventoryItem.id
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { variantId: variantIds[0], requiredQuantity: 1 },
    })
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`, {
      method: 'POST',
      headers: { cookie },
      body: { stockedQuantity: 12 },
    })

    // 6. Where to sell it (« Où le vendre »).
    await $fetch(`/api/admin/sales-channels/${channelId}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [productId] },
    })

    // Résumé -> « Mettre en vente ».
    const published = await $fetch<{ product: Product }>(`/api/admin/products/${productId}`, {
      method: 'POST',
      headers: { cookie },
      body: { status: 'published' },
    })
    expect(published.product.status).toBe('published')
  })

  it('the new product shows in the admin list AND in GET /api/store/products', async () => {
    const list = await $fetch<{ products: Product[] }>('/api/admin/products?q=Chemise', { headers: { cookie } })
    expect(list.products.map((p) => p.id)).toContain(productId)

    const store = await $fetch<{ products: Product[] }>('/api/store/products?q=Chemise')
    expect(store.products.map((p) => p.id)).toContain(productId)

    // …with the déclinaisons and the price the wizard set — what the fiche
    // produit reads back on its « Prix » tab.
    const detail = await $fetch<{ product: { variants: StoreVariant[] } }>(
      `/api/store/products/${productId}?currency_code=usd`,
    )
    expect(detail.product.variants).toHaveLength(2)
    expect(detail.product.variants[0]!.calculatedPrice?.calculatedAmount).toBe(4990)
    expect(detail.product.variants[0]!.calculatedPrice?.calculatedPriceId).toBeTruthy()
  })

  it('the fiche produit updates a price in place instead of creating a second one', async () => {
    const before = await $fetch<{ product: { variants: StoreVariant[] } }>(
      `/api/store/products/${productId}?currency_code=usd`,
    )
    const priceId = before.product.variants[0]!.calculatedPrice!.calculatedPriceId!

    await $fetch('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie },
      body: { update: [{ id: priceId, amount: 5990 }] },
    })

    const after = await $fetch<{ product: { variants: StoreVariant[] } }>(
      `/api/store/products/${productId}?currency_code=usd`,
    )
    const variant = after.product.variants.find((v) => v.id === before.product.variants[0]!.id)!
    expect(variant.calculatedPrice?.calculatedAmount).toBe(5990)
    expect(variant.calculatedPrice?.calculatedPriceId).toBe(priceId)
  })

  it('the list filters by status and by collection, the way the screen does', async () => {
    const collection = await $fetch<{ collection: Collection }>('/api/admin/collections', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Nouveautés' },
    })
    await $fetch(`/api/admin/collections/${collection.collection.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [productId] },
    })

    const inCollection = await $fetch<{ products: Product[] }>(
      `/api/admin/products?collection_id[]=${collection.collection.id}`,
      { headers: { cookie } },
    )
    expect(inCollection.products.map((p) => p.id)).toContain(productId)

    const drafts = await $fetch<{ products: Product[] }>('/api/admin/products?status=draft', { headers: { cookie } })
    expect(drafts.products.map((p) => p.id)).not.toContain(productId)

    // …and the collection screen removes a member again.
    await $fetch(`/api/admin/collections/${collection.collection.id}/products`, {
      method: 'POST',
      headers: { cookie },
      body: { remove: [productId] },
    })
    const emptied = await $fetch<{ products: Product[] }>(
      `/api/admin/products?collection_id[]=${collection.collection.id}`,
      { headers: { cookie } },
    )
    expect(emptied.products).toHaveLength(0)
  })

  it('the photos step uploads a file and the product picks it up as its thumbnail', async () => {
    const form = new FormData()
    // 1x1 transparent GIF — the smallest real image bytes.
    const bytes = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0))
    form.append('files', new Blob([bytes], { type: 'image/gif' }), 'chemise.gif')

    const uploaded = await $fetch<{ files: Upload[] }>('/api/admin/uploads', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(uploaded.files).toHaveLength(1)

    await $fetch(`/api/admin/products/${productId}/images`, {
      method: 'POST',
      headers: { cookie },
      body: { images: [{ url: uploaded.files[0]!.url }] },
    })

    const detail = await $fetch<{ product: Product }>(`/api/admin/products/${productId}`, { headers: { cookie } })
    expect(detail.product.thumbnail).toBe(uploaded.files[0]!.url)
  })

  it('the catégories screen creates a child under a parent, then moves it back to the top level', async () => {
    const parent = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Vêtements', isActive: true },
    })
    const child = await $fetch<{ category: Category }>('/api/admin/product-categories', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Chemises', parentCategoryId: parent.category.id, isActive: true },
    })

    expect(child.category.parentCategoryId).toBe(parent.category.id)
    expect(child.category.mpath).toBe(`${parent.category.mpath}.${child.category.id}`)

    // The flat list the tree screen builds from must carry both.
    const list = await $fetch<{ categories: Category[] }>('/api/admin/product-categories?limit=200', { headers: { cookie } })
    const ids = list.categories.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([parent.category.id, child.category.id]))

    // « Ranger dans » -> none: the move recomputes the mpath.
    const moved = await $fetch<{ category: Category }>(`/api/admin/product-categories/${child.category.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { parentCategoryId: null },
    })
    expect(moved.category.parentCategoryId).toBeNull()
    expect(moved.category.mpath).toBe(child.category.id)
  })

  it('a stock correction is reflected in the sellable quantity', async () => {
    const before = await $fetch<{ locationLevels: LocationLevel[] }>(
      `/api/admin/inventory-items/${inventoryItemId}/location-levels`,
      { headers: { cookie } },
    )
    expect(before.locationLevels[0]).toMatchObject({ stocked: 12, reserved: 0, available: 12 })

    // « J'ai reçu de la marchandise » (+8) -> the screen posts the new total.
    await $fetch(`/api/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`, {
      method: 'POST',
      headers: { cookie },
      body: { stockedQuantity: 20 },
    })

    const after = await $fetch<{ locationLevels: LocationLevel[] }>(
      `/api/admin/inventory-items/${inventoryItemId}/location-levels`,
      { headers: { cookie } },
    )
    expect(after.locationLevels[0]).toMatchObject({ stocked: 20, reserved: 0, available: 20 })
  })

  it('the stock screen resolves a déclinaison to its inventory item by référence', async () => {
    // No GET exists for the variant<->inventory-item link, so the screen
    // matches on the référence — this guards that contract.
    const found = await $fetch<{ inventoryItems: InventoryItem[] }>('/api/admin/inventory-items?q=chemise-en-lin-s', {
      headers: { cookie },
    })
    expect(found.inventoryItems.map((i) => i.sku)).toContain('chemise-en-lin-s')
  })

  it('the prix & taxes screen creates a rule and flips it tax-inclusive', async () => {
    const created = await $fetch<{ pricePreference: PricePreference }>('/api/admin/price-preferences', {
      method: 'POST',
      headers: { cookie },
      body: { attribute: 'currency_code', value: 'usd', isTaxInclusive: false },
    })
    expect(created.pricePreference.isTaxInclusive).toBe(false)

    const toggled = await $fetch<{ pricePreference: PricePreference }>(
      `/api/admin/price-preferences/${created.pricePreference.id}`,
      { method: 'POST', headers: { cookie }, body: { isTaxInclusive: true } },
    )
    expect(toggled.pricePreference.isTaxInclusive).toBe(true)

    const list = await $fetch<{ pricePreferences: PricePreference[] }>('/api/admin/price-preferences', {
      headers: { cookie },
    })
    expect(list.pricePreferences.some((p) => p.id === created.pricePreference.id)).toBe(true)

    await $fetch(`/api/admin/price-preferences/${created.pricePreference.id}`, { method: 'DELETE', headers: { cookie } })
    const emptied = await $fetch<{ pricePreferences: PricePreference[] }>('/api/admin/price-preferences', {
      headers: { cookie },
    })
    expect(emptied.pricePreferences.some((p) => p.id === created.pricePreference.id)).toBe(false)
  })

  it('deleting a product removes it from the list and from the storefront', async () => {
    await $fetch(`/api/admin/products/${productId}`, { method: 'DELETE', headers: { cookie } })

    const list = await $fetch<{ products: Product[] }>('/api/admin/products?q=Chemise', { headers: { cookie } })
    expect(list.products.map((p) => p.id)).not.toContain(productId)

    await expect($fetch(`/api/store/products/${productId}`)).rejects.toMatchObject({ statusCode: 404 })
  })
})
