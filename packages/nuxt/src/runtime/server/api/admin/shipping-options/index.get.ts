import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/shipping-options?limit&offset&service_zone_id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const query = getQuery(event)
  const { limit, offset } = listQuery(event)
  const shippingOptions = await usePygmalion().services.shipping.options.list({
    limit,
    offset,
    serviceZoneId: typeof query.service_zone_id === 'string' && query.service_zone_id ? query.service_zone_id : undefined,
  })
  return { shippingOptions }
})
