import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// GET /api/admin/inventory-items/:id/location-levels — products:read.
// Each level enriched with the computed reserved/available (never stored)
// for that location.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const item = await services.inventory.items.get(id)
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory item not found' })
  }
  const levels = await services.inventory.levels.list(id)
  const locationLevels = await Promise.all(
    levels.map(async (level: (typeof levels)[number]) => ({
      ...level,
      ...(await services.inventory.availability(id, level.locationId)),
    })),
  )
  return { locationLevels }
})
