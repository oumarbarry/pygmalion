import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/stock-locations/:id, settings:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const stockLocation = await usePygmalion().services.inventory.locations.remove(id)
  if (!stockLocation) {
    throw createError({ statusCode: 404, statusMessage: 'Stock location not found' })
  }
  return { stockLocation }
})
