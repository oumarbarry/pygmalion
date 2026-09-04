import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/shipping-profiles?limit&offset — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const { limit, offset } = listQuery(event)
  const shippingProfiles = await usePygmalion().services.shipping.profiles.list({
    limit,
    offset,
  })
  return { shippingProfiles }
})
