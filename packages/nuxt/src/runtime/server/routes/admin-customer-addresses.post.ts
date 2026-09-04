import { createCustomerAddressInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/customers/:id/addresses — customers:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'update')
  const customerId = getRouterParam(event, 'id')!
  const parsed = createCustomerAddressInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid address', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  if (!(await services.customers.get(customerId))) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  const address = await services.customers.addresses.create(customerId, parsed.data)
  setResponseStatus(event, 201)
  return { address }
})
