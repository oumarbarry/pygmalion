import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// POST /api/admin/orders/:id/edits/:editId/confirm — apply the edit in one tx:
// totals recomputed, reservations adjusted, order_event before/after.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const editId = getRouterParam(event, 'editId')!
  const order = await usePygmalion().services.orderEdits.confirm(editId)
  return { order }
})
