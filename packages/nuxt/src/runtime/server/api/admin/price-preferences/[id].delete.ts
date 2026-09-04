import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/price-preferences/:id — soft delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const removed = await usePygmalion().services.pricePreferences.remove(id)
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Price preference not found' })
  return { id, deleted: true }
})
