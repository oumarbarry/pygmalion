import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/orders/:id — order detail (items, shipping, append-only
// transactions, derived payment + fulfillment status, fulfillments).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const order = await services.checkout.getOrder(id)
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  const [fulfillmentStatus, fulfillments] = await Promise.all([
    services.fulfillments.orderFulfillmentStatus(id),
    services.fulfillments.listByOrder(id),
  ])
  return { order: { ...order, fulfillmentStatus, fulfillments } }
})
