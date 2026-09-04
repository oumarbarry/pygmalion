import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/products/:id — products:delete (soft delete).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const product = await usePygmalion().services.products.remove(id)
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  return { product }
})
