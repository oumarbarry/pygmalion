import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/products/:id/images/:imageId — products:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const imageId = getRouterParam(event, 'imageId')!
  const image = await usePygmalion().services.products.images.remove(productId, imageId)
  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }
  return { image }
})
