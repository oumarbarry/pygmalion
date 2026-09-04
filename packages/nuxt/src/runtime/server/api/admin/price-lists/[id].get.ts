import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/price-lists/:id, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const priceList = await usePygmalion().services.pricing.getPriceList(id)
  if (!priceList) {
    throw createError({ statusCode: 404, statusMessage: 'Price list not found' })
  }
  return { priceList }
})
