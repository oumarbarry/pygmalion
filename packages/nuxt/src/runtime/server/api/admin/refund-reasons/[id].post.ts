import { updateRefundReasonInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/refund-reasons/:id — update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateRefundReasonInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid refund reason', data: parsed.error.issues })
  const refundReason = await usePygmalion().services.payment.reasons.update(id, parsed.data)
  if (!refundReason) throw createError({ statusCode: 404, statusMessage: 'Refund reason not found' })
  return { refundReason }
})
