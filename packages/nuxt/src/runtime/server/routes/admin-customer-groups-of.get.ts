import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/customers/:id/customer-groups — the groups this customer belongs to.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'read')
  const customerId = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  if (!(await services.customers.get(customerId))) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  return { customerGroups: await services.customerGroups.groupsOf(customerId) }
})
