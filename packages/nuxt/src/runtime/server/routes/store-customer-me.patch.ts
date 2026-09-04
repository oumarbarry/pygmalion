import { updateCustomerInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireCustomer } from '../utils/customer-auth'
import { usePygmalion } from '../utils/pygmalion'

// PATCH /api/store/customers/me — session required. Profile fields only
// (name/phone/metadata); email/password go through `/api/auth/**`, that's
// better-auth's job, not ours.
export default defineEventHandler(async (event) => {
  const { id } = requireCustomer(event)
  const parsed = updateCustomerInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid customer', data: parsed.error.issues })
  }
  const customer = await usePygmalion().services.customers.update(id, parsed.data)
  return { customer }
})
