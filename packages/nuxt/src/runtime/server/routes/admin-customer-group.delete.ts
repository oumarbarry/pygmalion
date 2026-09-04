import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// DELETE /api/admin/customer-groups/:id — customers:delete (soft delete).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'delete')
  const id = getRouterParam(event, 'id')!
  const group = await usePygmalion().services.customerGroups.remove(id)
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Customer group not found' })
  }
  return { group }
})
