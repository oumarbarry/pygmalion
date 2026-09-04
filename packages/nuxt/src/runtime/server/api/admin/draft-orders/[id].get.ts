import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/draft-orders/:id
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const draftOrder = await usePygmalion().services.draftOrders.get(id)
  if (!draftOrder) throw createError({ statusCode: 404, statusMessage: 'Draft order not found' })
  return { draftOrder }
})
