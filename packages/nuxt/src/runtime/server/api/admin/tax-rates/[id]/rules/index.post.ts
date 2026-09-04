import { createTaxRateRuleInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/tax-rates/:id/rules — settings:update (one rule).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = createTaxRateRuleInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tax rate rule', data: parsed.error.issues })
  }
  const rule = await usePygmalion().services.taxRates.addRule(id, {
    ...parsed.data,
    createdBy: event.context.staff?.user.id,
  })
  if (!rule) {
    throw createError({ statusCode: 404, statusMessage: 'Tax rate not found' })
  }
  setResponseStatus(event, 201)
  return { rule }
})
