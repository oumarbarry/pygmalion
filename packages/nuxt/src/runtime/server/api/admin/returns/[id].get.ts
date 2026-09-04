import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/returns/:id — detail with items.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const ret = await usePygmalion().services.returns.get(id)
  if (!ret) throw createError({ statusCode: 404, statusMessage: 'Return not found' })
  return { return: ret }
})
