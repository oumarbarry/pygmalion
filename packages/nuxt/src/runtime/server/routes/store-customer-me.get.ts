import { defineEventHandler } from 'h3'
import { requireCustomer } from '../utils/customer-auth'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/store/customers/me, session required.
export default defineEventHandler(async (event) => {
  const { id } = requireCustomer(event)
  const customer = await usePygmalion().services.customers.get(id)
  return { customer }
})
