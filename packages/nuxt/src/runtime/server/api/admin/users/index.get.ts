import { staffUser } from '@oumarbarry/pygmalion-core/schema'
import { desc } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/users, staff:read (Medusa parity, `/admin/users` is GET only,
// no direct create). Reads the table directly: our own requirePermission
// already gated access (cookie session OR api-key), whereas better-auth's
// `listUsers` re-checks its own admin session and rejects api-key-derived
// sessions (role not threaded through its internal middleware).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'staff', 'read')
  const { db } = usePygmalion()
  const users = await db
    .select({
      id: staffUser.id,
      email: staffUser.email,
      name: staffUser.name,
      role: staffUser.role,
      banned: staffUser.banned,
      createdAt: staffUser.createdAt,
    })
    .from(staffUser)
    .orderBy(desc(staffUser.createdAt))
  return { users }
})
