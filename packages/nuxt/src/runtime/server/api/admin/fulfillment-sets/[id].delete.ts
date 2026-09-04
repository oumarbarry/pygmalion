import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/fulfillment-sets/:id — settings:delete. Soft-delete,
// cascades to its service zones (service).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const fulfillmentSet = await usePygmalion().services.shipping.fulfillmentSets.remove(id)
  if (!fulfillmentSet) throw createError({ statusCode: 404, statusMessage: 'Fulfillment set not found' })
  return { fulfillmentSet }
})
