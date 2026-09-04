import { staffApiKey } from '@oumarbarry/pygmalion-core/schema'
import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/api-keys, settings:read. Both publishable (`pk_`) and
// secret (`sk_`) keys live in the same better-auth-managed table
// (distinguished by `prefix`); the hashed `key` column is never
// returned, same as the invites list route never returns its token.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const { db } = usePygmalion()
  const apiKeys = await db
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
    .orderBy(desc(staffApiKey.createdAt))
  return { apiKeys }
})
