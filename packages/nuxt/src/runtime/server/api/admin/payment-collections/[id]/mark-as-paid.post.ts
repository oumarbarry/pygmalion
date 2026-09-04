import { markAsPaidInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/payment-collections/:id/mark-as-paid — manual encashment
// (cash, transfer, terminal): one session + one authorization + one full
// capture through the payment helpers. Conditional claim in the service:
// two concurrent calls capture once.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = markAsPaidInput.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid mark-as-paid', data: parsed.error.issues })
  const { services } = usePygmalion()
  try {
    const paymentCollection = await services.payment.collections.markAsPaid(id, {
      ...parsed.data,
      createdBy: event.context.staff?.user.id ?? null,
    })
    return { paymentCollection }
  } catch (e) {
    throw createError({ statusCode: 422, statusMessage: (e as Error).message })
  }
})
