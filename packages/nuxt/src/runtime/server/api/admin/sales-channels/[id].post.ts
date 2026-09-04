import { updateSalesChannelInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/sales-channels/:id — settings:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateSalesChannelInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid sales channel', data: parsed.error.issues })
  }
  const salesChannel = await usePygmalion().services.salesChannels.update(id, parsed.data)
  if (!salesChannel) {
    throw createError({ statusCode: 404, statusMessage: 'Sales channel not found' })
  }
  return { salesChannel }
})
