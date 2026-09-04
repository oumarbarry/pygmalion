import { createPygmalionClient, type FetchLike, type PygmalionClient } from '@oumarbarry/pygmalion-sdk'
import { useNuxtApp, useRequestEvent } from 'nuxt/app'

/**
 * The `@oumarbarry/pygmalion-sdk` client, wired to the app's own server.
 *
 * NOTE: `usePygmalion()` also exists SERVER-side (`runtime/server/utils`), where
 * it returns the runtime context (db + services). Same name, same intent — "the
 * Pygmalion handle for this side" — different object: a page/component gets an
 * HTTP client, a Nitro route gets the services directly.
 *
 * During SSR the client runs on `event.fetch`: the request stays in-process (no
 * HTTP hop, same as `useFetch`) and h3 forwards the incoming request's headers,
 * so the customer session cookie AND the httpOnly cart token reach the API. In
 * the browser it is the native `fetch` and the browser attaches the cookies.
 */
export function usePygmalion(): PygmalionClient {
  const nuxtApp = useNuxtApp() as unknown as { _pygmalionClient?: PygmalionClient }
  if (nuxtApp._pygmalionClient) return nuxtApp._pygmalionClient

  const event = useRequestEvent()
  const fetch = event?.fetch as FetchLike | undefined
  nuxtApp._pygmalionClient = createPygmalionClient(fetch ? { fetch } : {})
  return nuxtApp._pygmalionClient
}
