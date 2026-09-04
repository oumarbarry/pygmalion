import { groupMembersInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/customer-groups/:id/members — customers:update. Batch add/remove
// in one call (Medusa parity: `/admin/customer-groups/:id/customers`).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = groupMembersInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid members payload', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const group = await services.customerGroups.get(id)
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Customer group not found' })
  }
  await services.customerGroups.setMembers(id, parsed.data)
  const members = await services.customerGroups.members(id)
  return { members }
})
