import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { listQuery } from '../../../../utils/list-query'
import { withStoreVariants } from '../../../../utils/store-catalog'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/store/product-categories/:id/products?limit&offset — published
// products in a category; 404s unless the category itself is store-visible.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const category = await services.categories.getStorefront(id)
  if (!category) {
    throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  }
  const { limit, offset } = listQuery(event)
  const products = await services.categories.storefrontProducts(id, {
    limit,
    offset,
  })
  // Opt-in priced variants (see withStoreVariants) when a price context
  // is given: a collection/category grid prints prices like the main listing.
  return { products: await withStoreVariants(event, products) }
})
