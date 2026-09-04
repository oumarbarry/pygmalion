import { channelProductsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/sales-channels/:id/products — settings:update. Batch
// add/remove products from the channel (Medusa parity).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = channelProductsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid products', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const salesChannel = await services.salesChannels.get(id)
  if (!salesChannel) {
    throw createError({ statusCode: 404, statusMessage: 'Sales channel not found' })
  }
  await services.salesChannels.updateProducts(id, parsed.data)
  const productIds = await services.salesChannels.listProductIds(id)
  return { productIds }
})
