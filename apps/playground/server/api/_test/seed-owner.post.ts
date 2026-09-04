import { staffUser } from '@oumarbarry/pygmalion-core/schema'
import { count, eq } from 'drizzle-orm'

// TEST-ONLY bootstrap (like `_demo/*`): create (or ensure) an `owner` staff
// user server-side. Public staff sign-up is invite-only past the very first
// user (security hook in @oumarbarry/pygmalion), so E2E suites that need several
// owners in one run seed them here via better-auth's server-side createUser
// (proper password hashing), then sign in through the public endpoint for a
// cookie. Never shipped in `@oumarbarry/pygmalion` — playground-only.
export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<{ email: string, password: string }>(event)
  const { db } = usePygmalion()

  const [existing] = await db.select({ id: staffUser.id }).from(staffUser).where(eq(staffUser.email, email))
  if (!existing) {
    await staffAuth().api.createUser({
      body: { email, password, name: 'Test Owner', role: 'owner' },
    })
  } else {
    await db.update(staffUser).set({ role: 'owner' }).where(eq(staffUser.email, email))
  }
  const [{ n }] = await db.select({ n: count() }).from(staffUser)
  return { ok: true, staffCount: Number(n) }
})
