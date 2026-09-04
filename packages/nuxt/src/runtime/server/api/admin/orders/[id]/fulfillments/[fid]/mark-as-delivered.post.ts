import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// POST /api/admin/orders/:id/fulfillments/:fid/mark-as-delivered.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const fid = getRouterParam(event, 'fid')!
  const staff = event.context.staff
  const fulfillment = await usePygmalion().services.fulfillments.deliver(fid, { createdBy: staff?.user.id ?? null })
  return { fulfillment }
})
