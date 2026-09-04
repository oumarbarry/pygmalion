import { addLineItemInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requireCartAccess } from '../../../../../utils/cart'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/store/carts/:id/line-items — add a variant (or bump its
// quantity if already in the cart). Price snapshot + totals recalc happen
// inside `services.cart.addItem`.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const parsed = addLineItemInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid line item', data: parsed.error.issues })
  const cart = await services.cart.addItem(id, parsed.data)
  setResponseStatus(event, 201)
  return { cart }
})
