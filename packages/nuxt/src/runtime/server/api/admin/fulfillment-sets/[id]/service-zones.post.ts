import { createServiceZoneInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/fulfillment-sets/:id/service-zones — settings:create.
// `geoZones` may be supplied inline.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const fulfillmentSetId = getRouterParam(event, 'id')!
  const parsed = createServiceZoneInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid service zone', data: parsed.error.issues })
  }
  try {
    const serviceZone = await usePygmalion().services.shipping.serviceZones.create(fulfillmentSetId, parsed.data)
    setResponseStatus(event, 201)
    return { serviceZone }
  } catch (err) {
    if (err instanceof Error && /fulfillment set not found/.test(err.message)) {
      throw createError({ statusCode: 404, statusMessage: err.message })
    }
    if (err instanceof Error && /geo zone/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
