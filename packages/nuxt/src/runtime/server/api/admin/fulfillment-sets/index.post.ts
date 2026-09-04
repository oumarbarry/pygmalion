import { createFulfillmentSetInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/fulfillment-sets — settings:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createFulfillmentSetInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid fulfillment set', data: parsed.error.issues })
  }
  const fulfillmentSet = await usePygmalion().services.shipping.fulfillmentSets.create(parsed.data)
  setResponseStatus(event, 201)
  return { fulfillmentSet }
})
