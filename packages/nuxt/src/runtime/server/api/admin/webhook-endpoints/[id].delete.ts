import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/webhook-endpoints/:id — soft delete. Delivery history is
// append-only and survives; the worker just stops sending to it.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const removed = await usePygmalion().services.webhooks.endpoints.remove(id)
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Webhook endpoint not found' })
  return { id, deleted: true }
})
