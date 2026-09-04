import { createRefundReasonInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/refund-reasons — create a refund reason.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const parsed = createRefundReasonInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid refund reason', data: parsed.error.issues })
  const refundReason = await usePygmalion().services.payment.reasons.create(parsed.data)
  setResponseStatus(event, 201)
  return { refundReason }
})
