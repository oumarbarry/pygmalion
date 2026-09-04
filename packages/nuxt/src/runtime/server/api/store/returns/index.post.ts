import { z } from 'zod'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// The store payload is DELIBERATELY narrower than `requestReturnInput`:
// `refundAmount` (money) and `locationId` (warehouse routing) are staff
// decisions — a customer-supplied refund amount would be a client-controlled
// money field. Only what the customer legitimately declares is accepted.
const storeReturnInput = z.object({
  orderId: z.string().trim().min(1),
  email: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        lineItemId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        reasonId: z.string().trim().min(1).nullable().optional(),
        note: z.string().trim().min(1).nullable().optional(),
      }),
    )
    .min(1),
})

// POST /api/store/returns — a customer requests a return on ITS OWN order.
// Ownership: session customer, or the guest email that placed the order (same
// rule as GET /api/store/orders/:id). The service still enforces "shipped
// lines only, Σ requested ≤ shipped − already returned".
export default defineEventHandler(async (event) => {
  const parsed = storeReturnInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid return', data: parsed.error.issues })

  const { services } = usePygmalion()
  const order = await services.checkout.getOrder(parsed.data.orderId)
  if (!order || order.isDraftOrder) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  const customer = event.context.customer
  const owns = customer && order.customerId === customer.id
  const guestMatch = !!order.email && (parsed.data.email ?? '').toLowerCase() === order.email.toLowerCase()
  if (!owns && !guestMatch) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  try {
    const ret = await services.returns.request(order.id, { items: parsed.data.items, createdBy: null })
    setResponseStatus(event, 201)
    return { return: ret }
  } catch (e) {
    throw createError({ statusCode: 422, statusMessage: (e as Error).message })
  }
})
