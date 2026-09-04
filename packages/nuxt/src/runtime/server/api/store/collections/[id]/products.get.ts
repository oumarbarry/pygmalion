import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { listQuery } from '../../../../utils/list-query'
import { withStoreVariants } from '../../../../utils/store-catalog'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/store/collections/:id/products?limit&offset — published products in a collection.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const collection = await services.collections.get(id)
  if (!collection) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }
  const { limit, offset } = listQuery(event)
  const products = await services.collections.storefrontProducts(id, {
    limit,
    offset,
  })
  // Opt-in priced variants (see withStoreVariants) when a price context
  // is given: a collection/category grid prints prices like the main listing.
  return { products: await withStoreVariants(event, products) }
})
