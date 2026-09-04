import { variantImagesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// POST /api/admin/products/:id/variants/:variantId/images — products:update.
// Batch add/remove image_ids linked to this variant.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const variantId = getRouterParam(event, 'variantId')!
  const parsed = variantImagesInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid images batch', data: parsed.error.issues })
  }
  try {
    const imageIds = await usePygmalion().services.products.variants.setImages(productId, variantId, parsed.data)
    return { imageIds }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
