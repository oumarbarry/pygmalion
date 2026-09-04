import { completeDraftOrderInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/draft-orders/:id/convert-to-order — reserve stock, become a
// pending order, optional manual payment (order_transaction 'manual_payment').
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = completeDraftOrderInput.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid completion', data: parsed.error.issues })
  const staff = event.context.staff
  const order = await usePygmalion().services.draftOrders.complete(id, { ...parsed.data, createdBy: staff?.user.id ?? null })
  return { order }
})
