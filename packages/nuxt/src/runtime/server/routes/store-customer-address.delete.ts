import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCustomer } from '../utils/customer-auth'
import { usePygmalion } from '../utils/pygmalion'

// DELETE /api/store/customers/me/addresses/:id — session required, scoped to the caller's own addresses.
export default defineEventHandler(async (event) => {
  const { id } = requireCustomer(event)
  const addressId = getRouterParam(event, 'id')!
  const address = await usePygmalion().services.customers.addresses.remove(id, addressId)
  if (!address) {
    throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  }
  return { address }
})
