import { requestOrderEditInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/orders/:id/edits — request an order edit (status 'requested').
// Nothing is written to the order yet; preview/confirm follow.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = requestOrderEditInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid order edit', data: parsed.error.issues })
  const staff = event.context.staff
  const orderEdit = await usePygmalion().services.orderEdits.request(id, { ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return { orderEdit }
})
