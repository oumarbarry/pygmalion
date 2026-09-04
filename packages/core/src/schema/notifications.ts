import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Notifications queued for a `NotificationProvider`. A row is queued INSIDE the
 * outbox drain transaction (pure DB work) and handed to the provider AFTER that
 * commit, so an email/SMS transport never runs with a tx open.
 *
 * `channel` selects the medium (`email` | `feed`); `template` is the event-shaped
 * key a provider renders (`order.placed`, …) and `data` its payload.
 */
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  to: text('to').notNull(),
  channel: text('channel').notNull(),
  template: text('template').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  // pending -> sent | failed.
  status: text('status').notNull().default('pending'),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('notifications_to_idx').on(t.to),
  index('notifications_status_idx').on(t.status),
])

export type Notification = typeof notifications.$inferSelect
