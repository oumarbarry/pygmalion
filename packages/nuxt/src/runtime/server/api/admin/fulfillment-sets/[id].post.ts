import { updateFulfillmentSetInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/fulfillment-sets/:id — settings:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateFulfillmentSetInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid fulfillment set', data: parsed.error.issues })
  }
  const fulfillmentSet = await usePygmalion().services.shipping.fulfillmentSets.update(id, parsed.data)
  if (!fulfillmentSet) throw createError({ statusCode: 404, statusMessage: 'Fulfillment set not found' })
  return { fulfillmentSet }
})
