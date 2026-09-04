import { staffUser } from '@oumarbarry/pygmalion-core/schema'
import { eq } from 'drizzle-orm'

/**
 * A dev owner account, so `/admin` is one sign-in away instead of a
 * first-boot dance.
 *
 * Credentials are printed at boot and hard-coded on purpose: they only ever
 * exist next to a local PGlite file. `import.meta.dev` in `plugin.ts` is what
 * keeps this out of any build that could be deployed — nothing here checks it
 * again, so don't call it from anywhere else.
 */
const EMAIL = 'owner@pygmalion.dev'
const PASSWORD = 'pygmalion'

export async function seedDevStaff(): Promise<{ email: string; password: string; created: boolean }> {
  const { db } = usePygmalion()
  const [existing] = await db.select({ id: staffUser.id }).from(staffUser).where(eq(staffUser.email, EMAIL))
  if (existing) return { email: EMAIL, password: PASSWORD, created: false }

  // better-auth's server-side createUser: proper password hashing, and it
  // bypasses the invite-only guard the public sign-up route enforces.
  await staffAuth().api.createUser({
    body: { email: EMAIL, password: PASSWORD, name: 'Propriétaire (dev)', role: 'owner' },
  })
  return { email: EMAIL, password: PASSWORD, created: true }
}
