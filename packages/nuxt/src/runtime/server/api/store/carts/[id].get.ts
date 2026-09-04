import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCartAccess } from '../../../utils/cart'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/carts/:id — full cart with items/shipping methods/totals.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const cart = await usePygmalion().services.cart.get(id)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, cart)
  return { cart }
})
