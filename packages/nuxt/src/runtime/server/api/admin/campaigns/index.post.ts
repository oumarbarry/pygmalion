// --- Promotions --------------------------------------------------------------
import { createCampaignInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/campaigns, products:create. Budget is created nested
// in the same call.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createCampaignInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid campaign', data: parsed.error.issues })
  }
  const campaign = await usePygmalion().services.promotions.createCampaign(parsed.data)
  setResponseStatus(event, 201)
  return { campaign }
})
