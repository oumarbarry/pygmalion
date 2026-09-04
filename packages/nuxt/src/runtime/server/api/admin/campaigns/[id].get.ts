// --- Promotions --------------------------------------------------------------
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/campaigns/:id — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const campaign = await usePygmalion().services.promotions.getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return { campaign }
})
