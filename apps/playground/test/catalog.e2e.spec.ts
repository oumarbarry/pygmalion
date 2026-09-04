import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

// A raw HTTP GET with an unnormalized request-line path — unlike `fetch()`/
// `$fetch()`, which build the request through a WHATWG URL (RFC 3986
// dot-segment removal collapses `..`/`%2e%2e` client-side before the byte
// ever reaches the wire), this sends the literal path string so a
// server-side path-traversal guard is exercised for real.
function rawGet(path: string): Promise<{ status: number }> {
  const base = new URL(url('/'))
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: base.hostname, port: base.port, path, method: 'GET' }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode! }))
    })
    req.on('error', reject)
    req.end()
  })
}

interface Product {
  id: string
  handle: string
  status: string
  isGiftcard: boolean
  discountable: boolean
  thumbnail: string | null
}
interface Variant {
  id: string
  sku: string | null
  optionValueIds: string[]
}
interface OptionValue {
  id: string
  value: string
}
interface Option {
  id: string
  values: OptionValue[]
}
interface Image {
  id: string
  url: string
}
interface UploadedFile {
  id: string
  url: string
}

// Catalog core: full product/variant/
// option/image admin CRUD + batch, the giftcard->discountable and variant
// combination business rules end-to-end over HTTP, uploads via unstorage,
// and the store's published-only + q filtering.
describe('catalog (e2e)', async () => {
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
    ;({ cookie } = await seedOwnerSession('catalog-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  it('POST /api/admin/products creates a full product; GET/POST/DELETE round-trip', async () => {
    const created = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Chair', subtitle: 'Comfy', status: 'proposed', weight: 4.2 },
    })
    expect(created.product.id).toMatch(/^prod_/)
    expect(created.product.status).toBe('proposed')

    const fetched = await $fetch<{ product: Product }>(`/api/admin/products/${created.product.id}`, {
      headers: { cookie },
    })
    expect(fetched.product.handle).toBe('e2e-chair')

    const updated = await $fetch<{ product: Product }>(`/api/admin/products/${created.product.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { status: 'published' },
    })
    expect(updated.product.status).toBe('published')

    await $fetch(`/api/admin/products/${created.product.id}`, { method: 'DELETE', headers: { cookie } })
    await expect(
      $fetch(`/api/admin/products/${created.product.id}`, { headers: { cookie } }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('is_giftcard=true forces discountable=false over HTTP, on both create and update', async () => {
    const created = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Gift Card', isGiftcard: true, discountable: true },
    })
    expect(created.product.isGiftcard).toBe(true)
    expect(created.product.discountable).toBe(false)

    const plain = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Plain Product' },
    })
    expect(plain.product.discountable).toBe(true)
    const flipped = await $fetch<{ product: Product }>(`/api/admin/products/${plain.product.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { isGiftcard: true, discountable: true },
    })
    expect(flipped.product.discountable).toBe(false)
  })

  it('POST /api/admin/products/batch creates/updates/deletes in one call', async () => {
    const existing = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Batch Seed' },
    })
    const result = await $fetch<{ created: Product[]; updated: Product[]; deleted: string[] }>(
      '/api/admin/products/batch',
      {
        method: 'POST',
        headers: { cookie },
        body: {
          create: [{ title: 'E2E Batch New' }],
          update: [{ id: existing.product.id, title: 'E2E Batch Renamed' }],
          delete: [existing.product.id],
        },
      },
    )
    expect(result.created).toHaveLength(1)
    expect(result.deleted).toEqual([existing.product.id])
  })

  it('sku is unique globally while live, and is released for reuse after a soft-deleted variant', async () => {
    const p1 = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Shirt A' },
    })
    const p2 = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Shirt B' },
    })
    const v1 = await $fetch<{ variant: Variant }>(`/api/admin/products/${p1.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Default', sku: 'E2E-SKU-1' },
    })

    await expect(
      $fetch(`/api/admin/products/${p2.product.id}/variants`, {
        method: 'POST',
        headers: { cookie },
        body: { title: 'Default', sku: 'E2E-SKU-1' },
      }),
    ).rejects.toMatchObject({ statusCode: 422 })

    await $fetch(`/api/admin/products/${p1.product.id}/variants/${v1.variant.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })

    const v2 = await $fetch<{ variant: Variant }>(`/api/admin/products/${p2.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Default', sku: 'E2E-SKU-1' },
    })
    expect(v2.variant.sku).toBe('E2E-SKU-1')
  })

  it('validates variant option combinations: rejects a partial/duplicate combination, accepts a full one', async () => {
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Tee' },
    })
    const color = await $fetch<{ option: Option }>(`/api/admin/products/${product.product.id}/options`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Color', values: [{ value: 'Red' }, { value: 'Blue' }] },
    })

    // Only 1 of 1 options but with an option that doesn't exist -> also invalid; here
    // we exercise the duplicate-combination rule instead, which needs a first variant.
    const first = await $fetch<{ variant: Variant }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Red', optionValueIds: [color.option.values[0].id] },
    })
    expect(first.variant.optionValueIds).toEqual([color.option.values[0].id])

    await expect(
      $fetch(`/api/admin/products/${product.product.id}/variants`, {
        method: 'POST',
        headers: { cookie },
        body: { title: 'Red again', optionValueIds: [color.option.values[0].id] },
      }),
    ).rejects.toMatchObject({ statusCode: 422 })

    const second = await $fetch<{ variant: Variant }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Blue', optionValueIds: [color.option.values[1].id] },
    })
    expect(second.variant.optionValueIds).toEqual([color.option.values[1].id])

    const list = await $fetch<{ variants: Variant[] }>(`/api/admin/products/${product.product.id}/variants`, {
      headers: { cookie },
    })
    expect(list.variants).toHaveLength(2)
  })

  it('uploads a file via unstorage, attaches it as a product image, links it to a variant, then deletes both', async () => {
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Lamp' },
    })
    const variant = await $fetch<{ variant: Variant }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Default' },
    })

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }), 'swatch.png')
    const upload = await $fetch<{ files: UploadedFile[] }>('/api/admin/uploads', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(upload.files).toHaveLength(1)
    const key = upload.files[0].id

    // The bytes are retrievable back (no auth — an <img> tag can't attach a
    // cookie/api-key, so this GET is explicitly public, see admin-auth.ts).
    const bytes = await $fetch<ArrayBuffer>(upload.files[0].url, { responseType: 'arrayBuffer' })
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3, 4]))

    const images = await $fetch<{ images: Image[] }>(`/api/admin/products/${product.product.id}/images`, {
      method: 'POST',
      headers: { cookie },
      body: { images: [{ url: upload.files[0].url }] },
    })
    expect(images.images).toHaveLength(1)

    const reloaded = await $fetch<{ product: Product }>(`/api/admin/products/${product.product.id}`, {
      headers: { cookie },
    })
    expect(reloaded.product.thumbnail).toBe(upload.files[0].url)

    const linked = await $fetch<{ imageIds: string[] }>(
      `/api/admin/products/${product.product.id}/variants/${variant.variant.id}/images`,
      { method: 'POST', headers: { cookie }, body: { add: [images.images[0].id] } },
    )
    expect(linked.imageIds).toEqual([images.images[0].id])

    await $fetch(`/api/admin/products/${product.product.id}/images/${images.images[0].id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    await $fetch(`/api/admin/uploads/${key}`, { method: 'DELETE', headers: { cookie } })
    await expect($fetch(`/api/admin/uploads/${key}`)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an uploaded SVG with a <script> is served with nosniff + a script-disabling CSP; a path-traversal id 400s', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned = true</script></svg>'
    const form = new FormData()
    form.append('file', new Blob([svg], { type: 'image/svg+xml' }), 'evil.svg')
    const upload = await $fetch<{ files: UploadedFile[] }>('/api/admin/uploads', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(upload.files[0].id).toMatch(/\.svg$/)

    // `fetch()` (unlike `$fetch`) returns a plain Response, giving header access.
    const raw = await fetch(upload.files[0].url)
    expect(raw.headers.get('content-type')).toBe('image/svg+xml')
    expect(raw.headers.get('x-content-type-options')).toBe('nosniff')
    expect(raw.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'")
    expect(await raw.text()).toContain('<script>')

    // rawGet bypasses client-side URL normalization (see helper above) so
    // these hit the route's own SAFE_ID / `..` guard, not the client's.
    expect((await rawGet('/api/admin/uploads/%2e%2e')).status).toBe(400)
    expect((await rawGet('/api/admin/uploads/..%2Fx')).status).toBe(400)
  })

  it('the storefront only ever sees published products, and honours q', async () => {
    const draft = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Hidden Draft Zzz' },
    })
    const published = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'E2E Visible Findme Zzz', status: 'published' },
    })

    await expect(
      $fetch(`/api/store/products/${draft.product.id}`),
    ).rejects.toMatchObject({ statusCode: 404 })

    const found = await $fetch<{ product: Product }>(`/api/store/products/${published.product.id}`)
    expect(found.product.id).toBe(published.product.id)

    const searched = await $fetch<{ products: Product[] }>('/api/store/products?q=Findme')
    expect(searched.products.map((p) => p.id)).toContain(published.product.id)
    expect(searched.products.map((p) => p.id)).not.toContain(draft.product.id)
  })

  // The store detail used to return the product row alone: no
  // variant id to add to a cart, no price to show.
  it('the store product detail carries its variants with a calculated price', async () => {
    const product = (await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST', headers: { cookie }, body: { title: 'E2E Priced Mug', status: 'published' },
    })).product
    const variant = (await $fetch<{ variant: { id: string } }>(`/api/admin/products/${product.id}/variants`, {
      method: 'POST', headers: { cookie }, body: { title: 'Default' },
    })).variant
    await $fetch('/api/admin/prices/batch', {
      method: 'POST', headers: { cookie }, body: { create: [{ variantId: variant.id, currencyCode: 'usd', amount: 2500 }] },
    })

    interface StoreVariant { id: string; calculatedPrice: { calculatedAmount: number | null } | null }
    // No currency context -> variants, no price (a catalogue page still renders).
    const bare = await $fetch<{ product: { variants: StoreVariant[] } }>(`/api/store/products/${product.id}`)
    expect(bare.product.variants.map((v) => v.id)).toEqual([variant.id])
    expect(bare.product.variants[0].calculatedPrice).toBeNull()

    const priced = await $fetch<{ product: { variants: StoreVariant[] } }>(`/api/store/products/${product.id}?currency_code=usd`)
    expect(priced.product.variants[0].calculatedPrice?.calculatedAmount).toBe(2500)

    const list = await $fetch<{ variants: StoreVariant[] }>(`/api/store/product-variants?product_id=${product.id}&currency_code=usd`)
    expect(list.variants[0].calculatedPrice?.calculatedAmount).toBe(2500)
    await expect($fetch('/api/store/product-variants')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('a non-owner-scoped request without a session is rejected on admin catalog routes', async () => {
    await expect($fetch('/api/admin/products')).rejects.toMatchObject({ statusCode: 401 })
  })
})
