import { updateInventoryItemInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/inventory-items/:id, products:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateInventoryItemInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid inventory item', data: parsed.error.issues })
  }
  const inventoryItem = await usePygmalion().services.inventory.items.update(id, parsed.data)
  if (!inventoryItem) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory item not found' })
  }
  return { inventoryItem }
})
