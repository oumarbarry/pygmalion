import { updateReturnReasonInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/return-reasons/:id — update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateReturnReasonInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid return reason', data: parsed.error.issues })
  const returnReason = await usePygmalion().services.returns.reasons.update(id, parsed.data)
  if (!returnReason) throw createError({ statusCode: 404, statusMessage: 'Return reason not found' })
  return { returnReason }
})
