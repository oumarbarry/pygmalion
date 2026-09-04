import { channelKeysInput } from '@oumarbarry/pygmalion-core'
import { staffApiKey } from '@oumarbarry/pygmalion-core/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/api-keys/:id/sales-channels, settings:update. Batch
// add/remove channel scoping on a publishable key.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = channelKeysInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid sales channels', data: parsed.error.issues })
  }
  const { db, services } = usePygmalion()
  const [key] = await db
    .select({ id: staffApiKey.id, prefix: staffApiKey.prefix })
    .from(staffApiKey)
    .where(eq(staffApiKey.id, id))
    .limit(1)
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Api key not found' })
  if (key.prefix !== 'pk_') {
    throw createError({ statusCode: 422, statusMessage: 'Only publishable keys can be scoped to sales channels' })
  }
  await services.salesChannels.updateKeyChannels(id, parsed.data)
  const salesChannelIds = await services.salesChannels.listChannelIdsForKey(id)
  return { salesChannelIds }
})
