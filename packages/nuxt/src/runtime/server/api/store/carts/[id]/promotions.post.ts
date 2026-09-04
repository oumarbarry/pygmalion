// --- Promotions --------------------------------------------------------------
import { cartPromotionCodesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/store/carts/:id/promotions, apply one or more manual codes.
// Automatic promotions never need this route: every
// `recalc` re-evaluates every `is_automatic` promotion on its own.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const parsed = cartPromotionCodesInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid promotion codes', data: parsed.error.issues })
  try {
    const cart = await services.cart.applyPromotions(id, parsed.data)
    return { cart }
  } catch (err) {
    if (err instanceof Error && err.message.includes('unknown promotion code')) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
