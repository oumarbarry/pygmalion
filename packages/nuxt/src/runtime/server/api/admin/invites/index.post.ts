import { createHash, randomBytes } from 'node:crypto'
import { emitDomainEvent, pygId } from '@oumarbarry/pygmalion-core'
import { staffInvite } from '@oumarbarry/pygmalion-core/schema'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requirePermission, type StaffRole } from '../../../utils/auth'
import { isUniqueViolation } from '../../../utils/db-errors'
import { usePygmalion } from '../../../utils/pygmalion'

const ROLES: StaffRole[] = ['owner', 'manager', 'fulfiller']
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const createInviteInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES as [StaffRole, ...StaffRole[]]),
})

// POST /api/admin/invites, staff:create only (owner/manager). Token→accept
// is the sole path to a new staff user (Medusa parity); no
// direct create-user route exists.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'staff', 'create')

  const parsed = createInviteInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid invite', data: parsed.error.issues })
  }

  const { db } = usePygmalion()
  const now = new Date()
  // Security: the raw token is a bearer credential (it mints a staff account).
  // 256-bit random, returned ONCE in this response; only its SHA-256 is stored,
  // so a DB read (or the list route) can never yield a usable token.
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  let invite
  try {
    ;[invite] = await db
      .insert(staffInvite)
      .values({
        id: pygId('inv'),
        email: parsed.data.email,
        role: parsed.data.role,
        token: tokenHash,
        invitedBy: event.context.staff?.user.id,
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      })
      .returning()
  } catch (err) {
    // Unique partial index (staff_invite_email_pending_unique) — a live
    // invite already exists for this email.
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: 'An active invite already exists for this email' })
    }
    throw err
  }

  // The staff domain's only domain event: the invite email and any
  // webhook subscriber hang off this one. Payload carries the id only; the
  // notification resolver reads the email/role back from the row (never the
  // token, which is a bearer credential).
  await emitDomainEvent(db, 'staff-invite.created', { id: invite.id })

  setResponseStatus(event, 201)
  return { invite: { ...invite, token: rawToken } }
})
