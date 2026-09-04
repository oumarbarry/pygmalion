import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/products/:id — products:read (any status, unlike store).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const product = await usePygmalion().services.products.get(id)
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  return { product }
})
