import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/tax-rates/:id/rules/:ruleId — settings:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const ruleId = getRouterParam(event, 'ruleId')!
  const rule = await usePygmalion().services.taxRates.removeRule(id, ruleId)
  if (!rule) {
    throw createError({ statusCode: 404, statusMessage: 'Tax rate rule not found' })
  }
  return { rule }
})
