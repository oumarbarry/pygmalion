import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/fulfillment-sets?limit&offset — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const { limit, offset } = listQuery(event)
  const fulfillmentSets = await usePygmalion().services.shipping.fulfillmentSets.list({
    limit,
    offset,
  })
  return { fulfillmentSets }
})
