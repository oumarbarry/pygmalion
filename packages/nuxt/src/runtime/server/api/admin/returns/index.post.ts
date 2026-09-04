import { requestReturnInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/returns — request a return (body carries orderId + items).
// Shipped lines only; Σ requested ≤ shipped − already returned.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const body = (await readBody(event)) ?? {}
  const orderId = body.orderId
  if (!orderId) throw createError({ statusCode: 422, statusMessage: 'orderId is required' })
  const parsed = requestReturnInput.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid return', data: parsed.error.issues })
  const staff = event.context.staff
  const ret = await usePygmalion().services.returns.request(orderId, { ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return { return: ret }
})
