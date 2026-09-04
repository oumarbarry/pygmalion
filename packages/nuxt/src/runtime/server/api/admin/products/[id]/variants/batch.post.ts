import { batchVariantsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/products/:id/variants/batch — products:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const parsed = batchVariantsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid batch', data: parsed.error.issues })
  }
  try {
    return await usePygmalion().services.products.variants.batch(productId, parsed.data)
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
