import { updateWebhookEndpointInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/webhook-endpoints/:id — update url / events / active.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateWebhookEndpointInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid webhook endpoint', data: parsed.error.issues })
  const webhookEndpoint = await usePygmalion().services.webhooks.endpoints.update(id, parsed.data)
  if (!webhookEndpoint) throw createError({ statusCode: 404, statusMessage: 'Webhook endpoint not found' })
  return { webhookEndpoint }
})
