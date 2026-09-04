import { updateServiceZoneInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/fulfillment-sets/:id/service-zones/:zoneId — settings:update.
// `geoZones` (if present, even `[]`) replaces the whole set.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const fulfillmentSetId = getRouterParam(event, 'id')!
  const zoneId = getRouterParam(event, 'zoneId')!
  const parsed = updateServiceZoneInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid service zone', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const existing = await services.shipping.serviceZones.get(zoneId)
  if (!existing || existing.fulfillmentSetId !== fulfillmentSetId) {
    throw createError({ statusCode: 404, statusMessage: 'Service zone not found' })
  }
  try {
    const serviceZone = await services.shipping.serviceZones.update(zoneId, parsed.data)
    return { serviceZone }
  } catch (err) {
    if (err instanceof Error && /geo zone/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
