import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// GET /api/admin/products/:id/variants/:variantId — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const productId = getRouterParam(event, 'id')!
  const variantId = getRouterParam(event, 'variantId')!
  const variant = await usePygmalion().services.products.variants.get(productId, variantId)
  if (!variant) {
    throw createError({ statusCode: 404, statusMessage: 'Variant not found' })
  }
  return { variant }
})
