import { staffInvite } from '@oumarbarry/pygmalion-core/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/invites/:id — staff:read. Same column projection as the list:
// the token (a SHA-256 hash of a bearer credential) never leaves the DB.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'staff', 'read')
  const id = getRouterParam(event, 'id')!
  const { db } = usePygmalion()
  const [invite] = await db
    .select({
      id: staffInvite.id,
      email: staffInvite.email,
      role: staffInvite.role,
      invitedBy: staffInvite.invitedBy,
      expiresAt: staffInvite.expiresAt,
      acceptedAt: staffInvite.acceptedAt,
      revokedAt: staffInvite.revokedAt,
      createdAt: staffInvite.createdAt,
    })
    .from(staffInvite)
    .where(eq(staffInvite.id, id))
    .limit(1)
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  return { invite }
})
