import { createInventoryItemInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/inventory-items, products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createInventoryItemInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid inventory item', data: parsed.error.issues })
  }
  const inventoryItem = await usePygmalion().services.inventory.items.create(parsed.data)
  setResponseStatus(event, 201)
  return { inventoryItem }
})
