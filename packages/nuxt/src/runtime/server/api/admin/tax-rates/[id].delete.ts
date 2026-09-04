import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/tax-rates/:id — settings:delete. Soft-delete, cascades to
// its own rules (service).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const taxRate = await usePygmalion().services.taxRates.remove(id)
  if (!taxRate) {
    throw createError({ statusCode: 404, statusMessage: 'Tax rate not found' })
  }
  return { taxRate }
})
