import { staffInvite } from '@oumarbarry/pygmalion-core/schema'
import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/invites — staff:read. The token column is a SHA-256 hash,
// but even the hash stays out of list responses — nothing here is a credential.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'staff', 'read')
  const { db } = usePygmalion()
  const invites = await db
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
    .orderBy(desc(staffInvite.createdAt))
  return { invites }
})
