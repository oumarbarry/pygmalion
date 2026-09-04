/**
 * HTTP core of `@oumarbarry/pygmalion-sdk` — one `request()` over an injectable fetch.
 *
 * Deliberately not here: retries, caching, interceptors,
 * request cancellation, response envelopes unwrapping. The SDK calls the API
 * and types it; every behaviour above that belongs to the caller (a storefront
 * already has Nuxt's `useAsyncData`, an admin UI has its own store).
 */

/** The cookie `POST /api/store/carts` sets — mirrors `CART_TOKEN_COOKIE` server-side. */
export const CART_TOKEN_COOKIE = 'pygmalion_cart_token'

/** Thrown on any non-2xx response. `data` carries the route's `data` payload (zod issues on a 422). */
export class PygmalionError extends Error {
  readonly status: number
  readonly code?: string
  readonly data?: unknown

  constructor(status: number, message: string, code?: string, data?: unknown) {
    super(message)
    this.name = 'PygmalionError'
    this.status = status
    this.code = code
    this.data = data
  }
}

/** Native `fetch` shape — anything matching it can be injected (SSR fetch, test double). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface RequestOptions {
  /**
   * Query params: `undefined`/`null` are skipped, arrays are repeated
   * (`?tag=a&tag=b`), everything else is stringified.
   */
  query?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
}

export interface PygmalionClientOptions {
  /** Origin of the Pygmalion server. Empty (default) = same origin — the storefront case. */
  baseUrl?: string
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike
  /** Static or per-request headers (e.g. forwarding an SSR request's `cookie`). */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** Admin secret key (`sk_…`) — sent as `x-api-key`, the header better-auth's api-key plugin reads. */
  apiKey?: string
  /** Storefront publishable key (`pk_…`) — resolves the sales channel(s). */
  publishableKey?: string
  /** Guest cart token, for callers with no cookie jar (Node scripts, tests). Browsers get it httpOnly. */
  cartToken?: string
  /** Defaults to `include` so the customer session cookie rides along cross-origin. */
  credentials?: RequestCredentials
}

export type RequestFn = <T = unknown>(method: string, path: string, options?: RequestOptions) => Promise<T>

function queryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) for (const v of value) params.append(key, String(v))
    else params.append(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function errorFrom(res: Response): Promise<PygmalionError> {
  // Nitro error bodies: { statusCode, statusMessage, message, data }. A proxy
  // or a crash can answer HTML instead — never let the parse hide the status.
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object') {
    const { statusMessage, message, data } = body as { statusMessage?: string; message?: string; data?: unknown }
    return new PygmalionError(res.status, message ?? statusMessage ?? `HTTP ${res.status}`, statusMessage, data)
  }
  return new PygmalionError(res.status, `HTTP ${res.status} ${res.statusText}`.trim())
}

export function createRequest(options: PygmalionClientOptions = {}): RequestFn {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init))

  return async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers = new Headers(typeof options.headers === 'function' ? options.headers() : options.headers)
    if (options.apiKey) headers.set('x-api-key', options.apiKey)
    if (options.publishableKey) headers.set('x-publishable-api-key', options.publishableKey)
    if (options.cartToken) {
      const existing = headers.get('cookie')
      headers.set('cookie', [existing, `${CART_TOKEN_COOKIE}=${options.cartToken}`].filter(Boolean).join('; '))
    }
    for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v)
    if (opts.body !== undefined) headers.set('content-type', 'application/json')

    const res = await fetchImpl(`${baseUrl}${path}${opts.query ? queryString(opts.query) : ''}`, {
      method,
      // Plain object, not the `Headers` instance: wrappers that merge init
      // headers by spreading (h3's `event.fetch`) see nothing in a `Headers`.
      headers: Object.fromEntries(headers),
      credentials: options.credentials ?? 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })

    if (!res.ok) throw await errorFrom(res)
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }
}
