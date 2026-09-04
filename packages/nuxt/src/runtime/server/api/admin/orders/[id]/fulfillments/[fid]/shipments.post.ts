import { shipFulfillmentInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// POST /api/admin/orders/:id/fulfillments/:fid/shipments — register a shipment
// (shipped_at + optional tracking label).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const fid = getRouterParam(event, 'fid')!
  const parsed = shipFulfillmentInput.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid shipment', data: parsed.error.issues })
  const staff = event.context.staff
  const fulfillment = await usePygmalion().services.fulfillments.ship(fid, { ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return { fulfillment }
})
