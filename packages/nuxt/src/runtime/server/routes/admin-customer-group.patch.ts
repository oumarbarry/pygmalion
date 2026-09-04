import { updateCustomerGroupInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../utils/auth'
import { usePygmalion } from '../utils/pygmalion'

// PATCH /api/admin/customer-groups/:id — customers:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateCustomerGroupInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid customer group', data: parsed.error.issues })
  }
  const group = await usePygmalion().services.customerGroups.update(id, parsed.data)
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Customer group not found' })
  }
  return { group }
})
