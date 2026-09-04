import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/webhook-endpoints — list. Secrets are never in this payload:
// the service strips them (only create + rotate-secret ever return one).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  return { webhookEndpoints: await usePygmalion().services.webhooks.endpoints.list() }
})
