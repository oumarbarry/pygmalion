import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/tax-regions/:id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const taxRegion = await usePygmalion().services.taxRegions.get(id)
  if (!taxRegion) {
    throw createError({ statusCode: 404, statusMessage: 'Tax region not found' })
  }
  return { taxRegion }
})
