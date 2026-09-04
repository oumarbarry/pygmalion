import { sql } from 'drizzle-orm'

// Proves the hook-added `demo_notes` table exists after boot.
export default defineEventHandler(async () => {
  const { db } = usePygmalion()
  const res = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  )
  const rows = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
  return { tables: (rows as { table_name: string }[]).map((r) => r.table_name) }
})
