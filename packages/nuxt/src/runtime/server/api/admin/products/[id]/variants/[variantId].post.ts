import { updateVariantInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/products/:id/variants/:variantId — products:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const variantId = getRouterParam(event, 'variantId')!
  const parsed = updateVariantInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid variant', data: parsed.error.issues })
  }
  try {
    const variant = await usePygmalion().services.products.variants.update(productId, variantId, parsed.data)
    if (!variant) {
      throw createError({ statusCode: 404, statusMessage: 'Variant not found' })
    }
    return { variant }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
