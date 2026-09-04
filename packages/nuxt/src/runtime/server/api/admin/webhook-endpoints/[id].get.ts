import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/webhook-endpoints/:id — secret masked (see index.post.ts).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const webhookEndpoint = await usePygmalion().services.webhooks.endpoints.get(id)
  if (!webhookEndpoint) throw createError({ statusCode: 404, statusMessage: 'Webhook endpoint not found' })
  return { webhookEndpoint }
})
