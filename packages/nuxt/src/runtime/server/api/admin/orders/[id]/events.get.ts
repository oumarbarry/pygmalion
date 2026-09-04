import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { listQuery } from '../../../../utils/list-query'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/orders/:id/events — append-only audit journal of the order
// (before/after amounts of every financial mutation), newest first.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const orderId = getRouterParam(event, 'id')!
  const { limit, offset } = listQuery(event, { defaultLimit: 50 })
  const events = await usePygmalion().services.checkout.listOrderEvents(orderId, { limit, offset })
  return { events }
})
