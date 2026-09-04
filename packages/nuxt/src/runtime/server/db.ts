import type { PygmalionDatabase } from '@oumarbarry/pygmalion-core'
import type { PygmalionConfig } from './types'

export interface DbHandle {
  db: PygmalionDatabase
  dispose: () => Promise<void>
}

/**
 * Real Postgres via `DATABASE_URL` (prod), else an embedded PGlite in
 * `dataDir` (dev, zero install). Both yield a unified `PygmalionDatabase`.
 */
export async function createDatabase(config: PygmalionConfig): Promise<DbHandle> {
  if (config.databaseUrl) {
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const db = drizzle({ connection: config.databaseUrl }) as unknown as PygmalionDatabase
    const client = (db as unknown as { $client: { end: () => Promise<void> } }).$client
    return { db, dispose: () => client.end() }
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  // PGlite's own mkdir is not recursive: on a fresh checkout `.data/` does not
  // exist yet and `pnpm dev` dies before the first request. `memory://` must
  // not touch the filesystem.
  if (!config.dataDir.startsWith('memory://')) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(config.dataDir, { recursive: true })
  }
  const client = new PGlite(config.dataDir)
  const db = drizzle({ client }) as unknown as PygmalionDatabase
  return { db, dispose: () => client.close() }
}
