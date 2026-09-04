import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/exchanges/:id/complete — settle the difference (refund or
// deferred exchange_difference) once the inbound return is received.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  return { exchange: await usePygmalion().services.exchanges.complete(id) }
})
