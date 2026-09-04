import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/refund-reasons — referential attached to each refund.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  return { refundReasons: await usePygmalion().services.payment.reasons.list() }
})
