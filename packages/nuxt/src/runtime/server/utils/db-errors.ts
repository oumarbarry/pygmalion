/**
 * Unique-constraint detection that survives driver wrapping: drizzle/PGlite
 * put the Postgres "duplicate key" text in `err.cause`, not `err.message`,
 * so a guard on the top-level message alone
 * reports 500 instead of 409. Walk the cause chain and accept either the
 * SQLSTATE (23505) or the message text at any depth.
 */
export function isUniqueViolation(err: unknown): boolean {
  let depth = 0
  for (let e = err; e instanceof Error && depth < 10; e = e.cause as Error | undefined, depth++) {
    if ((e as { code?: string }).code === '23505') return true
    if (/unique constraint|duplicate key/i.test(e.message)) return true
  }
  return false
}
