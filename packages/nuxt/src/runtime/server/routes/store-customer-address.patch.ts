import { updateCustomerAddressInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCustomer } from '../utils/customer-auth'
import { usePygmalion } from '../utils/pygmalion'

// PATCH /api/store/customers/me/addresses/:id — session required, scoped to the caller's own addresses.
export default defineEventHandler(async (event) => {
  const { id } = requireCustomer(event)
  const addressId = getRouterParam(event, 'id')!
  const parsed = updateCustomerAddressInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid address', data: parsed.error.issues })
  }
  const address = await usePygmalion().services.customers.addresses.update(id, addressId, parsed.data)
  if (!address) {
    throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  }
  return { address }
})
