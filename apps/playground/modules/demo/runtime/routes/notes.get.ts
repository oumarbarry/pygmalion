import { desc } from 'drizzle-orm'
import { demoNotes } from '../../schema'

// Capability 3: a module serves its own `/api/store/**` route. `usePygmalion()`
// is auto-imported by @oumarbarry/pygmalion and hands back the same `db` the composed
// schema was pushed to, so the module's own table is queryable like any other.
export default defineEventHandler(async () => {
  const { db } = usePygmalion()
  const notes = await db.select().from(demoNotes).orderBy(desc(demoNotes.createdAt)).limit(20)
  return { notes }
})
