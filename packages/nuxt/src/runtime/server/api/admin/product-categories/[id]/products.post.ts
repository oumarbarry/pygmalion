import { categoryProductsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/product-categories/:id/products, products:update. Batch
// add/remove (Medusa parity).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = categoryProductsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid products', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const category = await services.categories.get(id)
  if (!category) {
    throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  }
  await services.categories.updateProducts(id, parsed.data)
  const productIds = await services.categories.listProductIds(id)
  return { productIds }
})
