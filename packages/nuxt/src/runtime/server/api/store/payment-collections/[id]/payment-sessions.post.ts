import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { usePygmalion } from '../../../../utils/pygmalion'

const input = z.object({ providerId: z.string().min(1).default('manual') })

// POST /api/store/payment-collections/:id/payment-sessions — open another
// session on an existing collection (switch provider, retry after a failure)
// without recreating the collection. Ownership: the collection's cart must be
// the caller's (same guard as every other /store/carts route).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const parsed = input.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid payment session', data: parsed.error.issues })

  const { services } = usePygmalion()
  const collection = await services.payment.collections.get(id)
  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Payment collection not found' })
  // A collection with no cart (admin/order-level) is never reachable from the store.
  if (!collection.cartId) throw createError({ statusCode: 404, statusMessage: 'Payment collection not found' })
  const cart = await services.cart.get(collection.cartId)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, cart)

  const paymentSession = await services.payment.sessions.create({ collectionId: id, providerId: parsed.data.providerId })
  return { paymentSession }
})
