import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/webhook-deliveries/:id/redeliver — queue a NEW pending
// delivery with the same payload. The original row keeps its outcome (the
// history is append-only); the next drain tick sends the copy.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const webhookDelivery = await usePygmalion().services.webhooks.deliveries.redeliver(id)
  if (!webhookDelivery) throw createError({ statusCode: 404, statusMessage: 'Webhook delivery not found' })
  setResponseStatus(event, 201)
  return { webhookDelivery }
})
