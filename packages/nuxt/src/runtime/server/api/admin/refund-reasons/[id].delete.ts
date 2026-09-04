import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/refund-reasons/:id — soft delete (past refunds keep the FK).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'delete')
  const id = getRouterParam(event, 'id')!
  const removed = await usePygmalion().services.payment.reasons.remove(id)
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Refund reason not found' })
  return { id, deleted: true }
})
