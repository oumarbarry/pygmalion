import { addImagesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/products/:id/images — products:update. Attaches images
// (unstorage keys, see /api/admin/uploads) to the product; auto-assigns rank
// and the product thumbnail when unset.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const parsed = addImagesInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid images', data: parsed.error.issues })
  }
  try {
    const images = await usePygmalion().services.products.images.add(productId, parsed.data)
    setResponseStatus(event, 201)
    return { images }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
