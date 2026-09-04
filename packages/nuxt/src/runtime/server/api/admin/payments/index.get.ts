import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/payments?orderId=&limit=&offset= — authorizations with their
// captured/refunded aggregates (SQL, never a stored counter).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const { limit, offset } = listQuery(event)
  const orderId = String(getQuery(event).orderId ?? '') || undefined
  return { payments: await usePygmalion().services.payment.payments.list({ orderId, limit, offset }) }
})
