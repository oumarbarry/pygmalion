import { createCustomerInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../utils/auth'
import { isUniqueViolation } from '../utils/db-errors'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/customers — customers:create. A merchant-created customer
// (phone/in-store order) has NO credential: it is a guest row until that email
// signs up through better-auth. 409 on a duplicate guest email.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'create')
  const parsed = createCustomerInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid customer', data: parsed.error.issues })
  }
  try {
    const customer = await usePygmalion().services.customers.create(parsed.data)
    setResponseStatus(event, 201)
    return { customer }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: 'A customer already exists for this email' })
    }
    throw err
  }
})
