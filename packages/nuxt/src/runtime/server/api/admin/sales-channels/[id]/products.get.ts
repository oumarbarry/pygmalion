import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// GET /api/admin/sales-channels/:id/products, product ids of the channel.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const channelId = getRouterParam(event, 'id')!
  const productIds = await usePygmalion().services.salesChannels.listProductIds(channelId)
  return { productIds }
})
