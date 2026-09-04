import { updateLineItemInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCartAccess } from '../../../../../utils/cart'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/store/carts/:id/line-items/:lineId — change a line's quantity.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const lineId = getRouterParam(event, 'lineId')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const parsed = updateLineItemInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid line item', data: parsed.error.issues })
  const cart = await services.cart.updateItem(id, lineId, parsed.data)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Line item not found' })
  return { cart }
})
