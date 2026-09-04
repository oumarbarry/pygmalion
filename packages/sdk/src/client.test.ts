import { describe, expect, it } from 'vitest'
import { createPygmalionClient, PygmalionError } from './index'

interface Call {
  url: string
  init: RequestInit
}

/** A fetch double that records every call and replies with `res()`. */
function recorder(res: () => Response = () => Response.json({ ok: true })) {
  const calls: Call[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init: init ?? {} })
    return res()
  }
  return { calls, fetch }
}

const headerOf = (call: Call, name: string) => new Headers(call.init.headers).get(name)

describe('createPygmalionClient — request building', () => {
  it('joins baseUrl and path, defaults to GET without a body', async () => {
    const { calls, fetch } = recorder()
    const client = createPygmalionClient({ baseUrl: 'https://shop.test', fetch })

    await client.request('GET', '/api/store/products')

    expect(calls[0].url).toBe('https://shop.test/api/store/products')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.body).toBeUndefined()
  })

  it('trims a trailing slash on baseUrl and accepts an empty one (same-origin)', async () => {
    const { calls, fetch } = recorder()
    await createPygmalionClient({ baseUrl: 'https://shop.test/', fetch }).request('GET', '/api/store/regions')
    await createPygmalionClient({ fetch }).request('GET', '/api/store/regions')

    expect(calls[0].url).toBe('https://shop.test/api/store/regions')
    expect(calls[1].url).toBe('/api/store/regions')
  })

  it('serializes query params, skipping undefined/null, repeating arrays', async () => {
    const { calls, fetch } = recorder()
    const client = createPygmalionClient({ fetch })

    await client.request('GET', '/api/store/products', {
      query: { limit: 10, q: 'mug', offset: undefined, order: null, 'category_id[]': ['a', 'b'] },
    })

    expect(calls[0].url).toBe('/api/store/products?limit=10&q=mug&category_id%5B%5D=a&category_id%5B%5D=b')
  })

  it('sends a JSON body with the matching content-type on writes', async () => {
    const { calls, fetch } = recorder()
    await createPygmalionClient({ fetch }).request('POST', '/api/store/carts', { body: { regionId: 'reg_1' } })

    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe('{"regionId":"reg_1"}')
    expect(headerOf(calls[0], 'content-type')).toBe('application/json')
  })
})

describe('createPygmalionClient — auth injection', () => {
  it('sends the admin secret key as x-api-key', async () => {
    const { calls, fetch } = recorder()
    await createPygmalionClient({ fetch, apiKey: 'sk_test_123' }).request('GET', '/api/admin/orders')

    expect(headerOf(calls[0], 'x-api-key')).toBe('sk_test_123')
  })

  it('sends the publishable key as x-publishable-api-key', async () => {
    const { calls, fetch } = recorder()
    await createPygmalionClient({ fetch, publishableKey: 'pk_test_123' }).request('GET', '/api/store/products')

    expect(headerOf(calls[0], 'x-publishable-api-key')).toBe('pk_test_123')
  })

  it('sends the guest cart token as the cart cookie (non-browser callers)', async () => {
    const { calls, fetch } = recorder()
    await createPygmalionClient({ fetch, cartToken: 'ctok_123' }).request('GET', '/api/store/carts/cart_1')

    expect(headerOf(calls[0], 'cookie')).toBe('pygmalion_cart_token=ctok_123')
  })

  it('keeps a caller-supplied cookie header and appends the cart token to it', async () => {
    const { calls, fetch } = recorder()
    const client = createPygmalionClient({ fetch, cartToken: 'ctok_123', headers: { cookie: 'session=abc' } })

    await client.request('GET', '/api/store/carts/cart_1')

    expect(headerOf(calls[0], 'cookie')).toBe('session=abc; pygmalion_cart_token=ctok_123')
  })

  it('sends credentials: include so the customer session cookie rides along', async () => {
    const { calls, fetch } = recorder()
    await createPygmalionClient({ fetch }).request('GET', '/api/store/customers/me')

    expect(calls[0].init.credentials).toBe('include')
  })

  it('hands headers to fetch as a PLAIN OBJECT', async () => {
    // h3's `event.fetch` (the SSR path of `usePygmalion`) merges init headers by
    // spreading them — spreading a `Headers` instance yields `{}` and silently
    // drops every auth header. Lowercased keys keep the merge deduplicated.
    const { calls, fetch } = recorder()
    await createPygmalionClient({ fetch, apiKey: 'sk_1' }).request('POST', '/api/admin/products', { body: { title: 'X' } })

    expect(calls[0].init.headers).toEqual({ 'x-api-key': 'sk_1', 'content-type': 'application/json' })
  })

  it('resolves headers per request when given a function (rotating tokens)', async () => {
    const { calls, fetch } = recorder()
    let n = 0
    const client = createPygmalionClient({ fetch, headers: () => ({ 'x-api-key': `sk_${++n}` }) })

    await client.request('GET', '/api/admin/orders')
    await client.request('GET', '/api/admin/orders')

    expect(headerOf(calls[0], 'x-api-key')).toBe('sk_1')
    expect(headerOf(calls[1], 'x-api-key')).toBe('sk_2')
  })
})

describe('createPygmalionClient — responses', () => {
  it('returns the parsed JSON body', async () => {
    const { fetch } = recorder(() => Response.json({ products: [{ id: 'prod_1' }] }))
    const res = await createPygmalionClient({ fetch }).request<{ products: { id: string }[] }>('GET', '/api/store/products')

    expect(res.products[0].id).toBe('prod_1')
  })

  it('returns undefined on 204 (no content)', async () => {
    const { fetch } = recorder(() => new Response(null, { status: 204 }))
    await expect(createPygmalionClient({ fetch }).request('DELETE', '/api/admin/products/prod_1')).resolves.toBeUndefined()
  })

  it('throws a typed PygmalionError carrying status, code, message and data', async () => {
    const { fetch } = recorder(() =>
      Response.json(
        { statusCode: 422, statusMessage: 'Invalid cart', message: 'Invalid cart', data: [{ path: ['regionId'] }] },
        { status: 422 },
      ),
    )
    const client = createPygmalionClient({ fetch })

    const err = await client.request('POST', '/api/store/carts').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PygmalionError)
    expect(err).toMatchObject({ status: 422, code: 'Invalid cart', message: 'Invalid cart', data: [{ path: ['regionId'] }] })
  })

  it('throws a PygmalionError even when the error body is not JSON', async () => {
    const { fetch } = recorder(() => new Response('<html>502</html>', { status: 502 }))
    const err = await createPygmalionClient({ fetch })
      .request('GET', '/api/store/products')
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PygmalionError)
    expect(err).toMatchObject({ status: 502 })
    expect((err as PygmalionError).message).toContain('502')
  })
})
