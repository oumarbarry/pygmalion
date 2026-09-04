import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/refund-reasons/:id
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const refundReason = await usePygmalion().services.payment.reasons.get(id)
  if (!refundReason) throw createError({ statusCode: 404, statusMessage: 'Refund reason not found' })
  return { refundReason }
})
