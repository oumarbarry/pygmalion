import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// GET /api/admin/products/:id/variants/:vid/inventory-items, variant→inventory
// links, kits included.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const variantId = getRouterParam(event, 'variantId')!
  const links = await usePygmalion().services.inventory.items.listVariantLinks(variantId)
  return { inventoryItems: links }
})
