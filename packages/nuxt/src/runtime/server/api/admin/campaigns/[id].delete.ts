// --- Promotions --------------------------------------------------------------
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/campaigns/:id — products:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const campaign = await usePygmalion().services.promotions.removeCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return { campaign }
})
