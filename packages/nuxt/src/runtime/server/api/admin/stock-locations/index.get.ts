import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/stock-locations?limit&offset&q, settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const { limit, offset, q } = listQuery(event)
  const stockLocations = await usePygmalion().services.inventory.locations.list({
    limit,
    offset,
    q,
  })
  return { stockLocations }
})
