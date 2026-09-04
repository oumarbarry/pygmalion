import { createClaimInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/claims, create a claim (replace → reserved outbound; refund
// → settled at complete via the payment ledger). Optional inbound return leg.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const body = (await readBody(event)) ?? {}
  const orderId = body.orderId
  if (!orderId) throw createError({ statusCode: 422, statusMessage: 'orderId is required' })
  const parsed = createClaimInput.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid claim', data: parsed.error.issues })
  const staff = event.context.staff
  const result = await usePygmalion().services.claims.create(orderId, { ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return result
})
