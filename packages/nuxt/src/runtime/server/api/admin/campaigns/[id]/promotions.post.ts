// --- Promotions --------------------------------------------------------------
import { campaignPromotionsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/campaigns/:id/promotions, products:update. Attach/detach
// promotions to the campaign (batch add/remove).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = campaignPromotionsInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid promotions', data: parsed.error.issues })
  const promotions = await usePygmalion().services.promotions.attachPromotions(id, parsed.data)
  if (!promotions) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return { promotions }
})
