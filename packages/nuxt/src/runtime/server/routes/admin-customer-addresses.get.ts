import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/customers/:id/addresses — customers:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'read')
  const customerId = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  if (!(await services.customers.get(customerId))) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  return { addresses: await services.customers.addresses.list(customerId) }
})
