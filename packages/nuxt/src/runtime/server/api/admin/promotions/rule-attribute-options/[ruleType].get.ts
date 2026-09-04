// --- Promotions --------------------------------------------------------------
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/promotions/rule-attribute-options/:ruleType — products:read.
// `ruleType`: rules | target-rules | buy-rules (admin UI rule
// builder). Optional `?target=items|shipping` narrows target/buy-rules'
// attribute set (order/items share the item set).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const ruleType = getRouterParam(event, 'ruleType')!
  if (ruleType !== 'rules' && ruleType !== 'target-rules' && ruleType !== 'buy-rules') {
    throw createError({ statusCode: 422, statusMessage: 'Invalid rule type' })
  }
  const target = getQuery(event).target === 'shipping' ? 'shipping' : 'items'
  const attributes = usePygmalion().services.promotions.ruleAttributeOptions(ruleType, target)
  return { attributes }
})
