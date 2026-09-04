import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/price-lists?limit&offset, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const { limit, offset } = listQuery(event)
  const priceLists = await usePygmalion().services.pricing.listPriceLists({
    limit,
    offset,
  })
  return { priceLists }
})
