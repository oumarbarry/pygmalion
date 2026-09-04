import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/inventory-items/:id/variants/:variantId — products:update.
// Unlinks a variant from this inventory item.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const variantId = getRouterParam(event, 'variantId')!
  const link = await usePygmalion().services.inventory.items.unlinkVariant(variantId, id)
  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  }
  return { link }
})
