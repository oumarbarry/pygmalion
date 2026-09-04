import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/tax-rates/:id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const taxRate = await services.taxRates.get(id)
  if (!taxRate) {
    throw createError({ statusCode: 404, statusMessage: 'Tax rate not found' })
  }
  const rules = await services.taxRates.rules(id)
  return { taxRate: { ...taxRate, rules } }
})
