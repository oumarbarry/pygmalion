import { staffUser } from '@oumarbarry/pygmalion-core/schema'
import { count } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { staffAuth } from '../../utils/auth'
import { usePygmalion } from '../../utils/pygmalion'

const bootstrapInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
})

// POST /api/admin/auth-bootstrap — PUBLIC, single-shot first-boot setup.
// Public staff sign-up is disabled (invite-only); the ONE
// legitimate unauthenticated creation is the very first `owner` on a fresh
// install. Guarded by a zero-staff check; any later call 403s.
export default defineEventHandler(async (event) => {
  const parsed = bootstrapInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid bootstrap payload', data: parsed.error.issues })
  }

  const { db } = usePygmalion()
  const [{ n }] = await db.select({ n: count() }).from(staffUser)
  if (Number(n) > 0) {
    throw createError({ statusCode: 403, statusMessage: 'Already bootstrapped — staff creation is invite-only' })
  }

  const { user } = await staffAuth().api.createUser({
    body: { email: parsed.data.email, name: parsed.data.name, password: parsed.data.password, role: 'owner' },
  })
  return { user }
})
