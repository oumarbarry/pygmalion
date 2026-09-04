import { receiveReturnInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/returns/:id/receive — receive units (partial possible),
// re-increments resellable stock; refunds on full receipt if a refund amount
// was set (append-only payment ledger).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = receiveReturnInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid receive', data: parsed.error.issues })
  const staff = event.context.staff
  const ret = await usePygmalion().services.returns.receive(id, { ...parsed.data, createdBy: staff?.user.id ?? null })
  return { return: ret }
})
