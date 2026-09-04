import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/exchanges/:id
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const id = getRouterParam(event, 'id')!
  const exchange = await usePygmalion().services.exchanges.get(id)
  if (!exchange) throw createError({ statusCode: 404, statusMessage: 'Exchange not found' })
  return { exchange }
})
