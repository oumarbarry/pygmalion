import { createWebhookEndpointInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/webhook-endpoints — create. The signing secret is returned
// HERE AND ONLY HERE (plus rotate-secret): every later read masks it, so a
// leaked list response can never be used to forge a signature.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createWebhookEndpointInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid webhook endpoint', data: parsed.error.issues })
  const webhookEndpoint = await usePygmalion().services.webhooks.endpoints.create(parsed.data)
  setResponseStatus(event, 201)
  return { webhookEndpoint }
})
