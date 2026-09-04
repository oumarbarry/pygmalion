import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/draft-orders/:id/cancel
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  return { draftOrder: await usePygmalion().services.draftOrders.cancel(id) }
})
