import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/inventory-items/:id/location-levels/:locationId, products:delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const locationId = getRouterParam(event, 'locationId')!
  const level = await usePygmalion().services.inventory.levels.remove(id, locationId)
  if (!level) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory level not found' })
  }
  return { level }
})
