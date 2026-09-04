import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/tax-regions?limit&offset&q&country_code&parent_id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const query = getQuery(event)
  const { limit, offset, q } = listQuery(event)
  const parentId =
    query.parent_id === 'null' ? null : typeof query.parent_id === 'string' ? query.parent_id : undefined
  const taxRegions = await usePygmalion().services.taxRegions.list({
    limit,
    offset,
    q,
    countryCode: typeof query.country_code === 'string' && query.country_code ? query.country_code : undefined,
    parentId,
  })
  return { taxRegions }
})
