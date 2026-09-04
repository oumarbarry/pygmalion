import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/payments/:id — one authorization with its captures/refunds.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const payment = await usePygmalion().services.payment.payments.get(id)
  if (!payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
  return { payment }
})
