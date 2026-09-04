import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/exchanges/:id/cancel — release outbound + cancel inbound.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  return { exchange: await usePygmalion().services.exchanges.cancel(id) }
})
