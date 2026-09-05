import type { PygmalionDatabase } from './types'

/**
 * Materialize `schema` into `db` by diffing against the live DB and applying the
 * generated DDL. Used for dev auto-push and in tests. Dialect: Postgres
 * (PGlite dev / node-postgres prod).
 *
 * Primary path: `drizzle-kit/api-postgres` `pushSchema()` — validated against
 * drizzle-orm/drizzle-kit 1.0.0-rc.4 + PGlite 0.5. Imported dynamically so
 * drizzle-kit never enters a production Nitro bundle when auto-push is unused.
 */
export async function pushDbSchema(
  db: PygmalionDatabase,
  schema: Record<string, unknown>,
  options: { dryRun?: boolean } = {},
): Promise<string[]> {
  const { pushSchema } = await import('drizzle-kit/api-postgres')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { sqlStatements, apply } = await pushSchema(schema, db as any)
  if (!options.dryRun) await apply()
  return sqlStatements
}

/**
 * The full DDL of `schema` as if the database were empty — what
 * `pygmalion-migrate generate` writes out. No database needed: the
 * baseline is the empty snapshot, so the result is a create-from-scratch
 * script, not an incremental diff.
 *
 * ponytail: deliberately an empty baseline instead of a snapshot folder. Incremental
 * convergence is `pushDbSchema` (it introspects the live DB); the day a
 * reviewable migration *history* is needed, keep the snapshots drizzle-kit
 * already knows how to emit and diff those two instead.
 */
export async function generateSchemaSql(schema: Record<string, unknown>): Promise<string[]> {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api-postgres')
  const empty = await generateDrizzleJson({})
  const target = await generateDrizzleJson(schema)
  return generateMigration(empty, target)
}
