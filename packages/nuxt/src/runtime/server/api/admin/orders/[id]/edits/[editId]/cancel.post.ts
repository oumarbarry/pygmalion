import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// POST /api/admin/orders/:id/edits/:editId/cancel — discard a requested edit.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const editId = getRouterParam(event, 'editId')!
  const orderEdit = await usePygmalion().services.orderEdits.cancel(editId)
  return { orderEdit }
})
