import { updateCustomerInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// PATCH /api/admin/customers/:id — customers:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateCustomerInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid customer', data: parsed.error.issues })
  }
  const customer = await usePygmalion().services.customers.update(id, parsed.data)
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  return { customer }
})
