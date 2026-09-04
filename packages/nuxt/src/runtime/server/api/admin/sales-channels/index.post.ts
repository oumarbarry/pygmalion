import { createSalesChannelInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/sales-channels — settings:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createSalesChannelInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid sales channel', data: parsed.error.issues })
  }
  const salesChannel = await usePygmalion().services.salesChannels.create(parsed.data)
  setResponseStatus(event, 201)
  return { salesChannel }
})
