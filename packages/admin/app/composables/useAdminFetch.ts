import type { UseFetchOptions } from 'nuxt/app'

/**
 * `useFetch` wired to the `$adminFetch` instance (plugins/admin-api.ts):
 * same-origin staff session cookie is sent automatically, and every error
 * gets a homogeneous toast (or a redirect to sign-in on 401). Screens
 * should reach for this instead of a bare `useFetch`/`$fetch` for
 * every `/api/admin/**` call.
 */
/**
 * The same `$adminFetch` instance, for the imperative calls `useAdminFetch`
 * cannot model: mutations (POST) and composed reads. Same behaviour (401 →
 * sign-in, any other error → one toast).
 *
 * The signature deliberately widens the URL to `string`: Nitro's typed-route
 * inference walks every registered route against the body shape and trips
 * TS2321 ("excessive stack depth") on this repo's larger admin payloads.
 * Response typing stays explicit through `T`.
 */
export function useAdminApi() {
  const { $adminFetch } = useNuxtApp()
  return $adminFetch as <T = unknown>(url: string, opts?: Record<string, unknown>) => Promise<T>
}

export function useAdminFetch<T = unknown>(url: string | (() => string), opts: UseFetchOptions<T> = {}) {
  const { $adminFetch } = useNuxtApp()
  return useFetch(url, {
    ...opts,
    $fetch: $adminFetch as typeof globalThis.$fetch,
  })
}
