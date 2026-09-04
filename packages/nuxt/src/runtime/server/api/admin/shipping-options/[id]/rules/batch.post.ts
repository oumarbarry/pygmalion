import { replaceShippingOptionRulesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/shipping-options/:id/rules/batch — settings:update.
// Replace-set: the given `rules` array becomes the option's entire rule set.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = replaceShippingOptionRulesInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid rules', data: parsed.error.issues })
  }
  const rules = await usePygmalion().services.shipping.options.replaceRules(id, parsed.data.rules)
  if (!rules) throw createError({ statusCode: 404, statusMessage: 'Shipping option not found' })
  return { rules }
})
