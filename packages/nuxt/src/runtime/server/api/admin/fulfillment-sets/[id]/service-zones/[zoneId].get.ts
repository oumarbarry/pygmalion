import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// GET /api/admin/fulfillment-sets/:id/service-zones/:zoneId — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const fulfillmentSetId = getRouterParam(event, 'id')!
  const zoneId = getRouterParam(event, 'zoneId')!
  const { services } = usePygmalion()
  const serviceZone = await services.shipping.serviceZones.get(zoneId)
  if (!serviceZone || serviceZone.fulfillmentSetId !== fulfillmentSetId) {
    throw createError({ statusCode: 404, statusMessage: 'Service zone not found' })
  }
  const geoZones = await services.shipping.serviceZones.geoZones(zoneId)
  return { serviceZone, geoZones }
})
