import { createExchangeInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/exchanges — create an exchange (inbound return + reserved
// outbound lines, two-way price difference computed).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const body = (await readBody(event)) ?? {}
  const orderId = body.orderId
  if (!orderId) throw createError({ statusCode: 422, statusMessage: 'orderId is required' })
  const parsed = createExchangeInput.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid exchange', data: parsed.error.issues })
  const staff = event.context.staff
  const result = await usePygmalion().services.exchanges.create(orderId, { ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return result
})
