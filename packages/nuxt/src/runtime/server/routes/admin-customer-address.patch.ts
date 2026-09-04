import { updateCustomerAddressInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// PATCH /api/admin/customers/:id/addresses/:addressId — customers:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'update')
  const customerId = getRouterParam(event, 'id')!
  const addressId = getRouterParam(event, 'addressId')!
  const parsed = updateCustomerAddressInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid address', data: parsed.error.issues })
  }
  const address = await usePygmalion().services.customers.addresses.update(customerId, addressId, parsed.data)
  if (!address) throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  return { address }
})
