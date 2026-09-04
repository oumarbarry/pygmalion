import { createCustomerAddressInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requireCustomer } from '../utils/customer-auth'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/store/customers/me/addresses — session required.
export default defineEventHandler(async (event) => {
  const { id } = requireCustomer(event)
  const parsed = createCustomerAddressInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid address', data: parsed.error.issues })
  }
  const address = await usePygmalion().services.customers.addresses.create(id, parsed.data)
  setResponseStatus(event, 201)
  return { address }
})
