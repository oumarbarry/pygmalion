import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/inventory-items/:id, products:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const inventoryItem = await usePygmalion().services.inventory.items.remove(id)
  if (!inventoryItem) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory item not found' })
  }
  return { inventoryItem }
})
