import { setCartAddressesInput, setCartEmailInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCartAccess } from '../../../utils/cart'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/store/carts/:id — update email and/or shipping/billing
// addresses (one combined "update cart" endpoint). Either half
// is optional; only what's present in the body is applied.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  let cart = existing

  if (body.email !== undefined) {
    const parsed = setCartEmailInput.safeParse({ email: body.email })
    if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid email', data: parsed.error.issues })
    cart = (await services.cart.setEmail(id, parsed.data))!
  }

  if (body.shippingAddress !== undefined || body.billingAddress !== undefined) {
    const parsed = setCartAddressesInput.safeParse({
      shippingAddress: body.shippingAddress,
      billingAddress: body.billingAddress,
    })
    if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid address', data: parsed.error.issues })
    cart = (await services.cart.setAddresses(id, parsed.data))!
  }

  return { cart }
})
