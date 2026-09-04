import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/tax-rates?limit&offset&q&tax_region_id&is_default — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const query = getQuery(event)
  const { limit, offset, q } = listQuery(event)
  const taxRates = await usePygmalion().services.taxRates.list({
    limit,
    offset,
    q,
    taxRegionId: typeof query.tax_region_id === 'string' && query.tax_region_id ? query.tax_region_id : undefined,
    isDefault: query.is_default === 'true' ? true : query.is_default === 'false' ? false : undefined,
  })
  return { taxRates }
})
