import { createError, defineEventHandler, getQuery } from 'h3'
import { storeVariants } from '../../../utils/store-catalog'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/product-variants?product_id=&region_id=|currency_code=
// Variants of a PUBLISHED product with their calculated price. Scoped to one
// product: a cross-product variant search is an admin concern.
export default defineEventHandler(async (event) => {
  const productId = String(getQuery(event).product_id ?? '')
  if (!productId) throw createError({ statusCode: 422, statusMessage: 'product_id is required' })
  const product = await usePygmalion().services.products.get(productId, { status: 'published' })
  if (!product) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return { variants: await storeVariants(event, productId) }
})
