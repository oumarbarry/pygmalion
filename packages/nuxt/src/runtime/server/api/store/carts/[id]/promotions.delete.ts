// --- Promotions --------------------------------------------------------------
import { cartPromotionCodesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { usePygmalion } from '../../../../utils/pygmalion'

// DELETE /api/store/carts/:id/promotions — remove one or more manual codes.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const parsed = cartPromotionCodesInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid promotion codes', data: parsed.error.issues })
  const cart = await services.cart.removePromotions(id, parsed.data)
  return { cart }
})
