import { customerUser } from '@oumarbarry/pygmalion-core/schema'
import { count, eq } from 'drizzle-orm'

// TEST-ONLY (like `_demo/*`, `_test/seed-owner`): calls `customersService.
// ensureGuest` server-side. `ensureGuest` is a plain service function meant
// to be called by the checkout, not exposed over `/api/store/**`;
// this route only exists so the E2E suite can exercise it and
// prove guest/account coexistence for the same email. Never shipped in
// `@oumarbarry/pygmalion` — playground-only.
export default defineEventHandler(async (event) => {
  const { email } = await readBody<{ email: string }>(event)
  const { db, services } = usePygmalion()

  const guest = await services.customers.ensureGuest(email)
  const [{ n }] = await db.select({ n: count() }).from(customerUser).where(eq(customerUser.email, email.toLowerCase()))
  return { guest, rowsForEmail: Number(n) }
})
