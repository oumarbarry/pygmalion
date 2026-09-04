import { emitDomainEvent } from '@oumarbarry/pygmalion-core'
import { staffApiKey } from '@oumarbarry/pygmalion-core/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/api-keys/:id/revoke — settings:update. Row is kept (audit
// trail) with `enabled: false`. Direct DB write rather than the plugin's own
// `updateApiKey` endpoint: that endpoint scopes updates to the CALLER's own
// key (`referenceId === session.user.id`), which fits end-user self-service
// but not admin RBAC — an owner/manager must be able to revoke ANY staff
// member's key, not just one they created themselves.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing api key id' })

  const { db } = usePygmalion()
  const [apiKey] = await db
    .update(staffApiKey)
    .set({ enabled: false })
    .where(eq(staffApiKey.id, id))
    .returning({
      id: staffApiKey.id,
      name: staffApiKey.name,
      prefix: staffApiKey.prefix,
      enabled: staffApiKey.enabled,
    })
  if (!apiKey) throw createError({ statusCode: 404, statusMessage: 'Api key not found' })
  await emitDomainEvent(db, 'api-key.revoked', { id })
  return { apiKey }
})
