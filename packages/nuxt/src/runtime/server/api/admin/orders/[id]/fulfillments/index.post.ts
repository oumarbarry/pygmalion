import { createFulfillmentInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/orders/:id/fulfillments — create a fulfillment on a selection
// of lines: decrements stock + reduces reservations at creation.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = createFulfillmentInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid fulfillment', data: parsed.error.issues })
  const staff = event.context.staff
  const { fulfillment, items } = await usePygmalion().services.fulfillments.create(id, { ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return { fulfillment, items }
})
