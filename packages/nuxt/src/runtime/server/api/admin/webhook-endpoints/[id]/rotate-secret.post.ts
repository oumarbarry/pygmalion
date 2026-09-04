import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/webhook-endpoints/:id/rotate-secret — mint a new signing
// secret and return it once. Signatures made with the old secret stop
// verifying immediately (no overlap window — a receiver rotates both sides).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const webhookEndpoint = await usePygmalion().services.webhooks.endpoints.rotateSecret(id)
  if (!webhookEndpoint) throw createError({ statusCode: 404, statusMessage: 'Webhook endpoint not found' })
  return { webhookEndpoint }
})
