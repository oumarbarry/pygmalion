import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { pushDbSchema } from './db/push'
import type { PygmalionDatabase } from './db/types'

/** In-memory PGlite db with `schema` pushed — for pure vitest suites. */
export async function createTestDb(
  schema: Record<string, unknown>,
): Promise<PygmalionDatabase> {
  const db = drizzle({ client: new PGlite() }) as unknown as PygmalionDatabase
  await pushDbSchema(db, schema)
  return db
}
