import { staffApiKey } from '@oumarbarry/pygmalion-core/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/api-keys/:id — settings:read. Publishable keys include
// their scoped sales-channel ids.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const { db, services } = usePygmalion()
  const [key] = await db
    .select({
      id: staffApiKey.id,
      name: staffApiKey.name,
      prefix: staffApiKey.prefix,
      start: staffApiKey.start,
      enabled: staffApiKey.enabled,
      referenceId: staffApiKey.referenceId,
      expiresAt: staffApiKey.expiresAt,
      createdAt: staffApiKey.createdAt,
    })
    .from(staffApiKey)
    .where(eq(staffApiKey.id, id))
    .limit(1)
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Api key not found' })
  const salesChannelIds = key.prefix === 'pk_' ? await services.salesChannels.listChannelIdsForKey(id) : []
  return { apiKey: { ...key, salesChannelIds } }
})
