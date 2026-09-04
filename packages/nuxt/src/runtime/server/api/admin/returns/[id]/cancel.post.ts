import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/returns/:id/cancel — cancel a not-yet-received return.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const ret = await usePygmalion().services.returns.cancel(id)
  return { return: ret }
})
