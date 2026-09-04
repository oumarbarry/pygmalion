import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/products/:id/variants/:variantId, products:delete (soft
// delete; frees sku/barcode/ean/upc for reuse).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const productId = getRouterParam(event, 'id')!
  const variantId = getRouterParam(event, 'variantId')!
  const variant = await usePygmalion().services.products.variants.remove(productId, variantId)
  if (!variant) {
    throw createError({ statusCode: 404, statusMessage: 'Variant not found' })
  }
  return { variant }
})
