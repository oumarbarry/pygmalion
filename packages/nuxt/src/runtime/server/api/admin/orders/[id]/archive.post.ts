import { archiveOrderInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/orders/:id/archive — archive (reversible via { archived:false }).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = archiveOrderInput.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid archive', data: parsed.error.issues })
  const order = await usePygmalion().services.checkout.archiveOrder(id, parsed.data)
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  return { order }
})
