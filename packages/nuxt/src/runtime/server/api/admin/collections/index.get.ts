import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/collections?limit&offset&q — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const { limit, offset, q } = listQuery(event)
  const collections = await usePygmalion().services.collections.list({
    limit,
    offset,
    q,
  })
  return { collections }
})
