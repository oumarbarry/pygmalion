import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/orders/:id — owner (session customer) OR guest with a matching
// email query param (?email=). Draft orders are never exposed to the storefront.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const order = await usePygmalion().services.checkout.getOrder(id)
  if (!order || order.isDraftOrder) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  const customer = event.context.customer
  const email = String(getQuery(event).email ?? '')
  const owns = customer && order.customerId === customer.id
  const guestMatch = !!order.email && email.toLowerCase() === order.email.toLowerCase()
  if (!owns && !guestMatch) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  // Where the shipment stands, and how many units of each line the
  // customer may still send back. `POST /api/store/returns` refuses a line
  // that was never shipped — without these the storefront can only offer a
  // return button and hope, or hide the feature entirely.
  const { services } = usePygmalion()
  const [fulfillmentStatus, returnable] = await Promise.all([
    services.fulfillments.orderFulfillmentStatus(id),
    services.returns.returnableByLine(id),
  ])
  return {
    order: {
      ...order,
      fulfillmentStatus,
      items: order.items.map((i) => ({ ...i, returnableQuantity: returnable.get(i.id) ?? 0 })),
    },
  }
})
