import { createCustomerGroupInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/customer-groups — customers:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'create')
  const parsed = createCustomerGroupInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid customer group', data: parsed.error.issues })
  }
  const group = await usePygmalion().services.customerGroups.create(parsed.data)
  setResponseStatus(event, 201)
  return { group }
})
