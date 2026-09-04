import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/orders?q&status&limit&offset — standard order list (EXCLUDES
// drafts). `q` matches email or id, `status` an exact order status; `count`
// pairs the same filters for pagination.
const ORDER_STATUSES = new Set(['pending', 'completed', 'canceled', 'archived'])

export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const { limit, offset, q } = listQuery(event)
  const query = getQuery(event)
  const rawStatus = query.status
  const status = typeof rawStatus === 'string' && ORDER_STATUSES.has(rawStatus) ? rawStatus : undefined
  // customerId: the service always accepted it; exposed for the customer
  // sheet's "their orders" section.
  const customerId = typeof query.customerId === 'string' && query.customerId ? query.customerId : undefined
  const { checkout } = usePygmalion().services
  const [orders, count] = await Promise.all([
    checkout.listOrders({ q, status, customerId, limit, offset }),
    checkout.countOrders({ q, status, customerId }),
  ])
  return { orders, count }
})
