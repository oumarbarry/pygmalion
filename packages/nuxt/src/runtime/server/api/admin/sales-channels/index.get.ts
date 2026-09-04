import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/sales-channels?limit&offset&q — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const { limit, offset, q } = listQuery(event)
  const salesChannels = await usePygmalion().services.salesChannels.list({
    limit,
    offset,
    q,
  })
  return { salesChannels }
})
