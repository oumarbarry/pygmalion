import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../../utils/auth'
import { usePygmalion } from '../../../../../../utils/pygmalion'

// GET /api/admin/orders/:id/edits/:editId/preview — in-memory projection of the
// order after the edit (zero writes before confirm).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const editId = getRouterParam(event, 'editId')!
  const preview = await usePygmalion().services.orderEdits.preview(editId)
  return { preview }
})
