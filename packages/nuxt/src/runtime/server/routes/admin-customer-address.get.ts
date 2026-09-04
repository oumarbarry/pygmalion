import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/customers/:id/addresses/:addressId — customers:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'read')
  const customerId = getRouterParam(event, 'id')!
  const addressId = getRouterParam(event, 'addressId')!
  const address = await usePygmalion().services.customers.addresses.get(customerId, addressId)
  if (!address) throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  return { address }
})
