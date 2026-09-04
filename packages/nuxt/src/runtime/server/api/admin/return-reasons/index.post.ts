import { createReturnReasonInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/return-reasons — create a return reason.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const parsed = createReturnReasonInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid return reason', data: parsed.error.issues })
  const returnReason = await usePygmalion().services.returns.reasons.create(parsed.data)
  setResponseStatus(event, 201)
  return { returnReason }
})
