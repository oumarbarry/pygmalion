import { upsertInventoryLevelInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/inventory-items/:id/location-levels/:locationId — products:update.
// Create-or-update the stock level for this item at this location.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const locationId = getRouterParam(event, 'locationId')!
  const parsed = upsertInventoryLevelInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid inventory level', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const item = await services.inventory.items.get(id)
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory item not found' })
  }
  const location = await services.inventory.locations.get(locationId)
  if (!location) {
    throw createError({ statusCode: 404, statusMessage: 'Stock location not found' })
  }
  const level = await services.inventory.levels.upsert(id, locationId, parsed.data)
  return { level }
})
