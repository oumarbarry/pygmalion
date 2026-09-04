import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/orders/:id/cancel — cancel a pre-fulfillment order: releases
// reservations, cancels the payment collection.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const order = await services.checkout.cancelOrder(id)
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  return { order }
})
