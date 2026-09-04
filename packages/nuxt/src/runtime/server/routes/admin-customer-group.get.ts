import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/customer-groups/:id — customers:read. Includes members.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const group = await services.customerGroups.get(id)
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Customer group not found' })
  }
  const members = await services.customerGroups.members(id)
  return { group: { ...group, members } }
})
