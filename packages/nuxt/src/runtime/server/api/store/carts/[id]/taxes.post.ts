import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/store/carts/:id/taxes — force a fresh tax recalculation (e.g.
// after a tax-region config change) without any other mutation.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const cart = await services.cart.recalcTaxes(id)
  return { cart }
})
