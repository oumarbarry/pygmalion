import { defineEventHandler } from 'h3'
import { requireCustomer } from '../utils/customer-auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/store/customers/me/addresses — session required.
export default defineEventHandler(async (event) => {
  const { id } = requireCustomer(event)
  const addresses = await usePygmalion().services.customers.addresses.list(id)
  return { addresses }
})
