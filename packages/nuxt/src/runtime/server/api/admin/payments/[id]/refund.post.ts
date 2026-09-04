import { refundPaymentInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/payments/:id/refund — refund THIS payment (capped by its own
// captured−refunded, in-tx, via the payment helper).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = refundPaymentInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid refund', data: parsed.error.issues })
  const { services } = usePygmalion()
  try {
    const order = await services.checkout.refundPayment(id, {
      ...parsed.data,
      createdBy: parsed.data.createdBy ?? event.context.staff?.user.id ?? null,
    })
    return { payment: await services.payment.payments.get(id), order }
  } catch (e) {
    throw createError({ statusCode: 422, statusMessage: (e as Error).message })
  }
})
