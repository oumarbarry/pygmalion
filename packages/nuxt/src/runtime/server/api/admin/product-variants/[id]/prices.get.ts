import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/product-variants/:id/prices, raw price rows of the variant:
// default prices first, then price-list-scoped.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const variantId = getRouterParam(event, 'id')!
  const prices = await usePygmalion().services.pricing.listByVariant(variantId)
  return { prices }
})
