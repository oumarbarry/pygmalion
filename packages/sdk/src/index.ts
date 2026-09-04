/**
 * `@oumarbarry/pygmalion-sdk` — typed HTTP client for a Pygmalion server.
 *
 * Zero runtime dependencies: native `fetch` (injectable) and nothing else.
 * `@oumarbarry/pygmalion-core` is a TYPE-ONLY dependency (entity rows + zod input types),
 * so the emitted `.mjs` imports nothing at all.
 *
 * The client mirrors the served surface,
 * grouped by resource: `client.store.*` and `client.admin.*`. It holds no
 * business logic — every method is one HTTP call to one route.
 */
import { createRequest, type PygmalionClientOptions, type RequestFn } from './client'
import { createAdminResources, type AdminResources } from './admin'
import { createStoreResources, type StoreResources } from './store'

export { CART_TOKEN_COOKIE, PygmalionError } from './client'
export type { AdminResources } from './admin'
export type { EmailPasswordInput, StoreResources, StoreReturnInput, UpdateCartInput } from './store'
export type * from './types'
export type {
  FetchLike,
  PygmalionClientOptions,
  RequestFn,
  RequestOptions,
} from './client'

export interface PygmalionClient {
  /** Escape hatch for anything the typed resources don't cover (`request('GET', '/api/…')`). */
  request: RequestFn
  store: StoreResources
  admin: AdminResources
}

export function createPygmalionClient(options: PygmalionClientOptions = {}): PygmalionClient {
  const request = createRequest(options)
  return { request, store: createStoreResources(request), admin: createAdminResources(request) }
}
