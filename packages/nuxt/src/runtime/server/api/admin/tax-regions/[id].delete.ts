import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/tax-regions/:id — settings:delete. Soft-delete, cascades
// to child regions and their tax rates (service).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const taxRegion = await usePygmalion().services.taxRegions.remove(id)
  if (!taxRegion) {
    throw createError({ statusCode: 404, statusMessage: 'Tax region not found' })
  }
  return { taxRegion }
})
