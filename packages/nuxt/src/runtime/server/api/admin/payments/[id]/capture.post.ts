import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

const captureInput = z.object({ amount: z.number().int().positive().optional() })

// POST /api/admin/payments/:id/capture — capture THIS authorization (an order
// with several collections has several payments; /orders/:id/capture only ever
// targets the principal one). amount omitted = the full authorized amount.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = captureInput.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid capture', data: parsed.error.issues })
  const { services } = usePygmalion()
  try {
    const order = await services.checkout.capturePayment(id, {
      amount: parsed.data.amount,
      createdBy: event.context.staff?.user.id ?? null,
    })
    return { payment: await services.payment.payments.get(id), order }
  } catch (e) {
    throw createError({ statusCode: 422, statusMessage: (e as Error).message })
  }
})
