import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Transactional outbox. A domain event is INSERTed in the same transaction
 * as the state change, so it persists iff the change commits. A Nitro task
 * drains it after commit and dispatches to `pygmalion:event` handlers.
 */
export const outbox = pgTable('outbox', {
  id: text('id').primaryKey(),
  event: text('event').notNull(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }).notNull().defaultNow(),
})

export type OutboxRow = typeof outbox.$inferSelect
