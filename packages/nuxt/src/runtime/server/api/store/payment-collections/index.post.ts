import { startPaymentInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireCartAccess } from '../../../utils/cart'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/store/payment-collections — create a payment collection + provider
// session on a cart (checkout step 1). Body: { cartId, providerId? }. The
// amount is the cart's current total (never trusted from the client).
export default defineEventHandler(async (event) => {
  const parsed = startPaymentInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid payment collection', data: parsed.error.issues })

  const { services } = usePygmalion()
  const cart = await services.cart.get(parsed.data.cartId)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, cart)

  const collection = await services.payment.collections.create({ cartId: cart.id, amount: cart.total, currencyCode: cart.currencyCode })
  await services.payment.sessions.create({ collectionId: collection.id, providerId: parsed.data.providerId })
  return { paymentCollection: await services.payment.collections.get(collection.id) }
})
