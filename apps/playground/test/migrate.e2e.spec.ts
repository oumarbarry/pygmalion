import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const playground = fileURLToPath(new URL('..', import.meta.url))
// The installed bin, not the source file: pnpm's shim exports the NODE_PATH a
// Nuxt app needs to resolve its own build-time modules (same shim `nuxi` uses).
const cli = fileURLToPath(new URL('../node_modules/.bin/pygmalion-migrate', import.meta.url))

/**
 * `pygmalion-migrate generate` produces the SQL of the *composed* schema
 * (core + every module's `pygmalion:schema` contribution) and that SQL is
 * valid Postgres on an empty database. The playground is the fixture: it loads
 * the demo module, whose `demo_notes` table only exists through the hook.
 *
 * No mock of the schema registry: the test shells out to the real bin, exactly
 * as the deploy docs tell an operator to.
 */
describe('pygmalion-migrate', () => {
  it('generates the composed schema and applies it to a virgin database', async () => {
    const { stdout: sql, stderr } = await run(cli, ['generate', '--cwd', playground], {
      maxBuffer: 32 * 1024 * 1024,
    })

    // A module's table travelled with core's.
    expect(stderr).toContain('@oumarbarry/pygmalion-core/schema')
    expect(sql).toContain('CREATE TABLE "products"')
    expect(sql).toContain('CREATE TABLE "demo_notes"')

    const db = new PGlite()
    try {
      // Statement by statement: PGlite's simple-query buffer truncates a 40 kB
      // script mid-token. `psql -f` swallows the file whole, no such split.
      for (const statement of sql.split(/;\s*\n/)) {
        if (statement.trim()) await db.exec(`${statement};`)
      }

      const { rows } = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
      )
      expect(rows[0]!.count).toBeGreaterThan(60)

      // The schema is not just parseable — its constraints are live.
      await db.exec(`INSERT INTO "demo_notes" ("id", "body") VALUES ('note_1', 'hello')`)
      await expect(
        db.exec(`INSERT INTO "product_variants" ("id", "product_id", "title") VALUES ('v_1', 'nope', 'X')`),
      ).rejects.toThrow(/foreign key/i)
    } finally {
      await db.close()
    }
  }, 300_000)
})
