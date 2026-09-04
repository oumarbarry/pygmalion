import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/fulfillment-sets/:id/service-zones/:zoneId — settings:delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const fulfillmentSetId = getRouterParam(event, 'id')!
  const zoneId = getRouterParam(event, 'zoneId')!
  const { services } = usePygmalion()
  const existing = await services.shipping.serviceZones.get(zoneId)
  if (!existing || existing.fulfillmentSetId !== fulfillmentSetId) {
    throw createError({ statusCode: 404, statusMessage: 'Service zone not found' })
  }
  const serviceZone = await services.shipping.serviceZones.remove(zoneId)
  return { serviceZone }
})
