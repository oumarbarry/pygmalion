// --- Promotions --------------------------------------------------------------
import { promotionRulesBatchInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/promotions/:id/buy-rules/batch — products:update. BuyGet's
// "buy" condition rules.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = promotionRulesBatchInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid rules', data: parsed.error.issues })
  const promotion = await usePygmalion().services.promotions.batchRules(id, 'buy', parsed.data)
  if (!promotion) throw createError({ statusCode: 404, statusMessage: 'Promotion not found' })
  return { promotion }
})
