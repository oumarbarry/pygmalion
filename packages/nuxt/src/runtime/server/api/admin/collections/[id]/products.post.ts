import { collectionProductsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/collections/:id/products, products:update. Batch add/remove
// (Medusa parity); "add" reassigns a product's collection.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = collectionProductsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid products', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const collection = await services.collections.get(id)
  if (!collection) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }
  await services.collections.updateProducts(id, parsed.data)
  const productIds = await services.collections.listProductIds(id)
  return { productIds }
})
