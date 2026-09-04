import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCartAccess } from '../../../../../utils/cart'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/store/carts/:id/line-items/:lineId — remove a line.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const lineId = getRouterParam(event, 'lineId')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const cart = await services.cart.removeItem(id, lineId)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Line item not found' })
  return { cart }
})
