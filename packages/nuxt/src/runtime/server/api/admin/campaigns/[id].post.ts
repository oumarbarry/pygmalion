// --- Promotions --------------------------------------------------------------
import { updateCampaignInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/campaigns/:id — products:update (Medusa: POST = update).
// `budget: null` clears the budget; omitted leaves it untouched.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateCampaignInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid campaign', data: parsed.error.issues })
  }
  const campaign = await usePygmalion().services.promotions.updateCampaign(id, parsed.data)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return { campaign }
})
