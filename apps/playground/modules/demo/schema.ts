import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// A third-party module's table joins the composed schema via the
// pygmalion:schema hook, and auto-push creates it at boot.
export const demoNotes = pgTable('demo_notes', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
