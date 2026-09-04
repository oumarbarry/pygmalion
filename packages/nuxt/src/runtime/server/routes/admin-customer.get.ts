import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/customers/:id — customers:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'read')
  const id = getRouterParam(event, 'id')!
  const customer = await usePygmalion().services.customers.get(id)
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  return { customer }
})
