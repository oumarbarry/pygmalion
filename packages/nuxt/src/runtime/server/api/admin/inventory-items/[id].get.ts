import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/inventory-items/:id, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const inventoryItem = await usePygmalion().services.inventory.items.get(id)
  if (!inventoryItem) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory item not found' })
  }
  return { inventoryItem }
})
