import { createAuthClient } from 'better-auth/vue'
import { adminClient } from 'better-auth/client/plugins'
import { apiKeyClient } from '@better-auth/api-key/client'

/**
 * Client for the `staff` better-auth instance, mounted at
 * `/api/admin/auth/**` by @oumarbarry/pygmalion (packages/nuxt/src/runtime/server/
 * utils/auth.ts, not touched by this layer). Reused as-is rather than
 * hand-rolling session/sign-in fetch logic.
 *
 * Lazy on purpose: `/admin/**` is ssr:false, but this layer's global route
 * middleware still gets bundled into the SSR entry (global middleware runs
 * for every route the host app serves, e.g. a storefront `/`). Constructing
 * the client at module scope made better-auth resolve the relative
 * `baseURL` into an absolute URL immediately — which throws server-side
 * with no request origin available. Building it only on first real use
 * (always client-side in practice, since /admin/** never SSRs) avoids that.
 *
 * The origin is spelled out rather than left relative: better-auth parses
 * `baseURL` with `new URL()`, and `new URL('/api/admin/auth')` throws
 * "Invalid base URL" with no second argument — in the browser too, not only
 * on the server. Deferring construction was only half the fix; every /admin
 * page 500'd on mount until the origin was supplied here.
 */
let client: ReturnType<typeof createAuthClient> | undefined

export function getAuthClient() {
  client ??= createAuthClient({
    baseURL: `${window.location.origin}/api/admin/auth`,
    plugins: [adminClient(), apiKeyClient()],
  })
  return client
}
