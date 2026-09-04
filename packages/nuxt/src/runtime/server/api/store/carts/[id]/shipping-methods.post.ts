import { setShippingMethodInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/store/carts/:id/shipping-methods — set the cart's shipping
// method. With `shippingOptionId`, the option is looked up and priced for
// real (see `validation/cart.ts`); without it, the caller supplies `name` +
// `amount` directly. Replaces any existing method (single shipping method
// per cart, a deliberate simplification).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const parsed = setShippingMethodInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid shipping method', data: parsed.error.issues })
  const cart = await services.cart.setShippingMethod(id, parsed.data)
  return { cart }
})
