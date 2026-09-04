import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/returns?orderId=|?status=&limit=&offset= — one order's returns, or the cross-order list.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const query = getQuery(event)
  const orderId = String(query.orderId ?? '')
  const status = typeof query.status === 'string' && query.status ? query.status : undefined
  const { limit, offset } = listQuery(event, { defaultLimit: 50 })
  // orderId scopes to one order; without it, cross-order list.
  const returns = orderId
    ? await usePygmalion().services.returns.listByOrder(orderId)
    : await usePygmalion().services.returns.list({ status, limit, offset })
  return { returns }
})
