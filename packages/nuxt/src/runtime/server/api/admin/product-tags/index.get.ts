import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/product-tags?limit&offset&q — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const { limit, offset, q } = listQuery(event)
  const tags = await usePygmalion().services.tags.list({
    limit,
    offset,
    q,
  })
  return { tags }
})
