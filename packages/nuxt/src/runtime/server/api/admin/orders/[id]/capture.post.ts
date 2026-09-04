import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { usePygmalion } from '../../../../utils/pygmalion'

const captureInput = z.object({ amount: z.number().int().positive().optional() })

// POST /api/admin/orders/:id/capture — capture (deferred, e.g. at shipment).
// amount omitted = full remaining. Records an append-only order_transaction.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const parsed = captureInput.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid capture', data: parsed.error.issues })
  const { services } = usePygmalion()
  const order = await services.checkout.captureOrder(id, { amount: parsed.data.amount })
  return { order }
})
