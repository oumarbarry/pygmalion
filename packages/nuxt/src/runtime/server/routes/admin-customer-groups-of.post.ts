import { groupMembersInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/customers/:id/customer-groups — batch add/remove THIS
// customer from groups (mirror of /customer-groups/:id/members, customer side).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'update')
  const customerId = getRouterParam(event, 'id')!
  const parsed = groupMembersInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid groups payload', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  if (!(await services.customers.get(customerId))) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  await services.customerGroups.setGroupsOf(customerId, parsed.data)
  return { customerGroups: await services.customerGroups.groupsOf(customerId) }
})
