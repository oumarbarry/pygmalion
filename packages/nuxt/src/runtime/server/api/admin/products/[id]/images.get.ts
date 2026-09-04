import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/products/:id/images, ordered images.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const productId = getRouterParam(event, 'id')!
  const images = await usePygmalion().services.products.images.list(productId)
  return { images }
})
