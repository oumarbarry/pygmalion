// --- Promotions --------------------------------------------------------------
import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/promotions?limit&offset, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const { limit, offset } = listQuery(event)
  const promotions = await usePygmalion().services.promotions.list({
    limit,
    offset,
  })
  return { promotions }
})
