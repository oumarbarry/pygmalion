import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { listQuery } from '../../../../utils/list-query'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/price-lists/:id/prices, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const priceList = await services.pricing.getPriceList(id)
  if (!priceList) {
    throw createError({ statusCode: 404, statusMessage: 'Price list not found' })
  }
  const { limit, offset } = listQuery(event, { defaultLimit: 50, maxLimit: 200 })
  const prices = await services.pricing.listPrices(id, { limit, offset })
  return { prices }
})
