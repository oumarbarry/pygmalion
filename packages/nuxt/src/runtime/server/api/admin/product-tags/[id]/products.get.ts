import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/product-tags/:id/products, product ids carrying the tag.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const tagId = getRouterParam(event, 'id')!
  const productIds = await usePygmalion().services.tags.listProductIds(tagId)
  return { productIds }
})
