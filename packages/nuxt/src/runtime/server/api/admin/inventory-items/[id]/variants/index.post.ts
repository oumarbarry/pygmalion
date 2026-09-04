import { linkVariantInventoryItemInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'
import { z } from 'zod'

// POST /api/admin/inventory-items/:id/variants — products:update. Links a
// variant to this inventory item (kit support, `required_quantity`). Kept
// under `inventory-items/` rather than Medusa's
// `/admin/products/:id/variants/:variantId/inventory-items` (deliberate
// route-shape deviation, same underlying `variant_inventory_items` link).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = z.object({ variantId: z.string().trim().min(1) }).and(linkVariantInventoryItemInput.omit({ inventoryItemId: true })).safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid variant link', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const item = await services.inventory.items.get(id)
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: 'Inventory item not found' })
  }
  const link = await services.inventory.items.linkVariant(parsed.data.variantId, {
    inventoryItemId: id,
    requiredQuantity: parsed.data.requiredQuantity,
  })
  return { link }
})
