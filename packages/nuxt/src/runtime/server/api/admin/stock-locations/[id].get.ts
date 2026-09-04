import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/stock-locations/:id, settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const stockLocation = await usePygmalion().services.inventory.locations.get(id)
  if (!stockLocation) {
    throw createError({ statusCode: 404, statusMessage: 'Stock location not found' })
  }
  return { stockLocation }
})
