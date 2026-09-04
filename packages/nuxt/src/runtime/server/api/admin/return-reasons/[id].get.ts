import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/return-reasons/:id
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const returnReason = await usePygmalion().services.returns.reasons.get(id)
  if (!returnReason) throw createError({ statusCode: 404, statusMessage: 'Return reason not found' })
  return { returnReason }
})
