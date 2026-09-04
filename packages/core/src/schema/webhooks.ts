import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Outgoing webhooks. Two tables, one law: the fan-out (endpoint ->
// delivery row) happens INSIDE the outbox drain transaction; the HTTP call
// happens after that commit, never in an open tx.

/**
 * A subscriber URL. `events` is a plain string array; `'*'` subscribes to every
 * domain event. `secret` signs every body (HMAC-SHA256) and is returned in
 * clear ONCE at creation / rotation — the admin surface masks it afterwards.
 */
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  active: boolean('active').notNull().default(true),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

/**
 * Delivery attempt log — APPEND-ONLY history: rows are inserted by the fan-out
 * and never deleted; a redeliver appends a NEW row rather than resetting one.
 * The only mutations are the worker's conditional status/attempts updates
 * (compare-and-swap claim, so two workers never send the same row twice).
 */
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  endpointId: text('endpoint_id')
    .notNull()
    .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  // pending -> delivered | failed (failed = attempts exhausted).
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  responseStatus: integer('response_status'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('webhook_deliveries_endpoint_idx').on(t.endpointId),
  // The worker's hot query: pending rows whose backoff has elapsed.
  index('webhook_deliveries_due_idx').on(t.status, t.nextAttemptAt),
])

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect
