import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// DELETE /api/admin/customers/:id/addresses/:addressId — customers:delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'delete')
  const customerId = getRouterParam(event, 'id')!
  const addressId = getRouterParam(event, 'addressId')!
  const address = await usePygmalion().services.customers.addresses.remove(customerId, addressId)
  if (!address) throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  return { id: addressId, deleted: true }
})
