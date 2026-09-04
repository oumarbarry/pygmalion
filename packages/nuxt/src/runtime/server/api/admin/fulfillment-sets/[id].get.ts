import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/fulfillment-sets/:id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const fulfillmentSet = await services.shipping.fulfillmentSets.get(id)
  if (!fulfillmentSet) throw createError({ statusCode: 404, statusMessage: 'Fulfillment set not found' })
  const serviceZones = await services.shipping.serviceZones.list(id)
  return { fulfillmentSet, serviceZones }
})
