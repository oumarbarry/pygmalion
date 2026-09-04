import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/sales-channels/:id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const salesChannel = await usePygmalion().services.salesChannels.get(id)
  if (!salesChannel) {
    throw createError({ statusCode: 404, statusMessage: 'Sales channel not found' })
  }
  return { salesChannel }
})
