import { priceListProductsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/price-lists/:id/products, products:update. Associates
// products/variants with a price list by creating list-scoped prices for
// them.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const priceList = await services.pricing.getPriceList(id)
  if (!priceList) {
    throw createError({ statusCode: 404, statusMessage: 'Price list not found' })
  }
  const parsed = priceListProductsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid products', data: parsed.error.issues })
  }
  const result = await services.pricing.addProductsToList(id, parsed.data)
  return result
})
