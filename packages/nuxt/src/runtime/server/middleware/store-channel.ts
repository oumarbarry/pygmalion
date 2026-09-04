import { createError, defineEventHandler, getHeader } from 'h3'
import { staffAuth } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

declare module 'h3' {
  interface H3EventContext {
    /**
     * Sales-channel ids resolved for this `/api/store/**` request. Set by
     * this middleware; always an array (possibly empty) once it
     * has run. Storefront routes (e.g. `GET /api/store/products`) pass this
     * straight into `services.products.list({ channelIds })`.
     */
    saleschannels?: string[]
  }
}

// Resolves the request's sales channel(s) from the `x-publishable-api-key`
// header (Medusa parity) and guards `/api/store/**`:
//  - no header at all -> dev-permissive fallback to the store's default
//    channel (no publishable key configured yet is a normal dev state).
//  - a header present but invalid/unknown/revoked/expired/not a publishable
//    key -> 401, always.
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]
  if (!path.startsWith('/api/store/')) return

  const { services } = usePygmalion()
  const rawKey = getHeader(event, 'x-publishable-api-key')
  if (!rawKey) {
    const defaultChannel = await services.salesChannels.getDefaultChannel()
    event.context.saleschannels = defaultChannel ? [defaultChannel.id] : []
    return
  }

  const result = await staffAuth().api.verifyApiKey({ body: { key: rawKey } })
  if (!result.valid || !result.key || !result.key.prefix?.startsWith('pk_')) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or revoked publishable API key' })
  }
  event.context.saleschannels = await services.salesChannels.listChannelIdsForKey(result.key.id)
})
