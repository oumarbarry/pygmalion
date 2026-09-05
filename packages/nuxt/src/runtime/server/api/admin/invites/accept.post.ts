import { createHash } from 'node:crypto'
import { staffInvite } from '@oumarbarry/pygmalion-core/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { staffAuth, staffRoles, type StaffRole } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

const acceptInviteInput = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1),
  password: z.string().min(8),
})

// POST /api/admin/invites/accept — PUBLIC (token-authenticated, not session).
// Atomic invite→accept (Medusa parity): no direct create-user route exists,
// this is the only path to a new staff row. The invite is claimed with a
// single conditional UPDATE (guards concurrent double-accept) before the
// better-auth user is created, so two racing requests can't both succeed.
// ponytail: deliberately, if createUser then fails, the invite stays burned rather than
// un-claimed; acceptable (retry = new invite), full 2-phase rollback isn't
// worth it for an admin-only, low-volume flow.
export default defineEventHandler(async (event) => {
  const parsed = acceptInviteInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid accept payload', data: parsed.error.issues })
  }

  const { db } = usePygmalion()
  const [invite] = await db
    .update(staffInvite)
    .set({ acceptedAt: new Date() })
    .where(
      and(
        // Only the SHA-256 of the raw token is at rest (see index.post.ts).
        eq(staffInvite.token, createHash('sha256').update(parsed.data.token).digest('hex')),
        isNull(staffInvite.acceptedAt),
        isNull(staffInvite.revokedAt),
        gt(staffInvite.expiresAt, new Date()),
      ),
    )
    .returning()

  if (!invite) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid, expired, or already-used invite token' })
  }

  // Never trust the stored role blindly — it must still be a known role
  // (defense in depth vs a tampered/legacy row minting an out-of-matrix role).
  if (!(invite.role in staffRoles)) {
    throw createError({ statusCode: 400, statusMessage: 'Invite carries an unknown role' })
  }

  const { user } = await staffAuth().api.createUser({
    body: {
      email: invite.email,
      name: parsed.data.name,
      password: parsed.data.password,
      role: invite.role as StaffRole,
    },
  })

  return { user }
})
