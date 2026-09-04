import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { requireCustomer } from '../../../../utils/customer-auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/store/carts/:id/customer — attach the signed-in customer to a
// guest cart (login transfer). Session required; the cart itself must
// still be reachable via its guest token (requireCartAccess) the first time
// — once transferred, the session alone authorizes it from then on.
export default defineEventHandler(async (event) => {
  const customer = requireCustomer(event)
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const existing = await services.cart.get(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, existing)

  const cart = await services.cart.transferToCustomer(id, { customerId: customer.id })
  return { cart }
})
