import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/claims/:id
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const claim = await usePygmalion().services.claims.get(id)
  if (!claim) throw createError({ statusCode: 404, statusMessage: 'Claim not found' })
  return { claim }
})
