import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/product-variants/:id/price?currency_code=&region_id=,
// calculated price of a variant: what an exchange
// or claim outbound line should charge.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const variantId = getRouterParam(event, 'id')!
  const query = getQuery(event)
  const currencyCode = typeof query.currency_code === 'string' && query.currency_code ? query.currency_code : undefined
  if (!currencyCode) throw createError({ statusCode: 422, statusMessage: 'currency_code is required' })
  const regionId = typeof query.region_id === 'string' && query.region_id ? query.region_id : undefined
  const priced = await usePygmalion().services.pricing.calculatePrices([variantId], { currencyCode, regionId })
  const price = priced.get(variantId) ?? null
  return { price }
})
