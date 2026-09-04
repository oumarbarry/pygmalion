import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCartAccess } from '../../../../utils/cart'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/store/carts/:id/complete, checkout (no external call in an open tx).
// TX1 (reserve + order pending) -> authorize OUTSIDE tx -> TX2 finalize / TX2'
// compensate. Idempotent: replaying a completed cart returns its order.
// Response mirrors Medusa's completeCart shape: `type` is 'order' on success
// (payment authorized), 'cart' when the order was canceled (authorize failed).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const cart = await services.cart.get(id)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, cart)

  const { order, status } = await services.checkout.completeCart(id)
  const full = await services.checkout.getOrder(order.id)
  return { type: status === 'error' ? 'cart' : 'order', status, order: full }
})
