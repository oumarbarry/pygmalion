import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { listQuery } from '../../../../utils/list-query'
import { withStoreVariants } from '../../../../utils/store-catalog'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/store/product-tags/:id/products?limit&offset — published products carrying a tag.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const tag = await services.tags.get(id)
  if (!tag) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }
  const { limit, offset } = listQuery(event)
  const products = await services.tags.storefrontProducts(id, {
    limit,
    offset,
  })
  // Opt-in priced variants (see withStoreVariants) when a price context
  // is given: a collection/category grid prints prices like the main listing.
  return { products: await withStoreVariants(event, products) }
})
