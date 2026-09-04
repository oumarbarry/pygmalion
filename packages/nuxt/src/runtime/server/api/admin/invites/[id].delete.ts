import { staffInvite } from '@oumarbarry/pygmalion-core/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/invites/:id — staff:delete. Soft-revoke (kept for audit,
// frees the email for a new invite via the partial-unique index).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'staff', 'delete')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing invite id' })

  const { db } = usePygmalion()
  const [invite] = await db
    .update(staffInvite)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffInvite.id, id), isNull(staffInvite.acceptedAt), isNull(staffInvite.revokedAt)))
    .returning()

  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  return { invite }
})
