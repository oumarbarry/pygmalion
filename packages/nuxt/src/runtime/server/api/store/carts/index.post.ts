import { createCartInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { setCartTokenCookie } from '../../../utils/cart'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/store/carts — create a cart (guest, or attached to the signed-in
// customer if a session is present). Sets the opaque cart-token cookie the
// storefront needs for every subsequent mutation (requireCartAccess).
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const parsed = createCartInput.safeParse({
    ...body,
    // Sales channel: explicit body value, else the request's resolved
    // channel (store-channel middleware). Customer: NEVER trust the body —
    // always the authenticated session, so a guest cannot attach a cart to
    // an arbitrary customer id.
    salesChannelId: body.salesChannelId ?? event.context.saleschannels?.[0],
    customerId: event.context.customer?.id,
  })
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid cart', data: parsed.error.issues })
  }
  const cart = await usePygmalion().services.cart.create(parsed.data)
  setCartTokenCookie(event, cart.token)
  setResponseStatus(event, 201)
  return { cart }
})
