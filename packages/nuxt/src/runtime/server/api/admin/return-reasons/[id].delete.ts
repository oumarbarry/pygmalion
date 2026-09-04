import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/return-reasons/:id — soft delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const returnReason = await usePygmalion().services.returns.reasons.remove(id)
  if (!returnReason) throw createError({ statusCode: 404, statusMessage: 'Return reason not found' })
  return { id, deleted: true }
})
