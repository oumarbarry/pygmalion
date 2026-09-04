import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { carts } from './cart'

// Payment domain. Key rules:
//   - money is integer cents, never floats.
//   - a payment_collection's authorized/captured/refunded amounts are NEVER
//     stored columns: they are SQL aggregates over `payments`/`captures`/
//     `refunds` computed in `services/payment.ts` (no mutable money counter
//     that can drift). Only `amount` (the target) and `status` (a state, not
//     a counter) live on the collection.
//   - `data` (jsonb) is opaque provider state threaded between provider calls
//     (initiate -> authorize -> capture -> ...), persisted on the session /
//     payment between steps: the only channel of state Pygmalion shares with
//     a `PaymentProvider`.
//
// `payment_collections.orderId` is a deliberately weak reference (plain text,
// no `.references()`), same precedent as `reservation_items.line_item_id` and
// `tax_regions.provider_id`.

// --- PaymentCollection --------------------------------------------------------

export const paymentCollections = pgTable(
  'payment_collections',
  {
    id: text('id').primaryKey(),
    // On a cart first (checkout), then linked to the order it produced.
    cartId: text('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    orderId: text('order_id'),
    currencyCode: text('currency_code').notNull(),
    // The amount to authorize (cart/order total at collection time), cents.
    amount: integer('amount').notNull(),
    // not_paid -> awaiting -> authorized/partially_authorized ->
    // captured/partially_captured -> refunded/partially_refunded, plus
    // canceled/failed/completed. A state machine, not a counter (see header).
    status: text('status').notNull().default('not_paid'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_collections_cart_id_idx').on(t.cartId),
    index('payment_collections_order_id_idx').on(t.orderId),
    check('payment_collections_amount_nonneg', sql`${t.amount} >= 0`),
  ],
)

export type PaymentCollection = typeof paymentCollections.$inferSelect

// --- PaymentSession -----------------------------------------------------------
// `data` = opaque provider blob (default `{}`), threaded between provider calls.

export const paymentSessions = pgTable(
  'payment_sessions',
  {
    id: text('id').primaryKey(),
    paymentCollectionId: text('payment_collection_id')
      .notNull()
      .references(() => paymentCollections.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    // pending -> authorized -> captured, branches error/canceled/requires_more/
    // pending_authorization.
    status: text('status').notNull().default('pending'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    context: jsonb('context').$type<Record<string, unknown> | null>(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_sessions_collection_id_idx').on(t.paymentCollectionId)],
)

export type PaymentSession = typeof paymentSessions.$inferSelect

// --- Payment ------------------------------------------------------------------
// One authorization = one Payment row. Captures/refunds hang off it and are
// append-only (their SUM is the source of truth for captured/refunded amounts).

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    paymentCollectionId: text('payment_collection_id')
      .notNull()
      .references(() => paymentCollections.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => paymentSessions.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    providerId: text('provider_id').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payments_collection_id_idx').on(t.paymentCollectionId)],
)

export type Payment = typeof payments.$inferSelect

// --- Capture / Refund (append-only money movements) ---------------------------

export const captures = pgTable(
  'captures',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('captures_payment_id_idx').on(t.paymentId), check('captures_amount_pos', sql`${t.amount} > 0`)],
)

export type Capture = typeof captures.$inferSelect

export const refundReasons = pgTable('refund_reasons', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type RefundReason = typeof refundReasons.$inferSelect

export const refunds = pgTable(
  'refunds',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    note: text('note'),
    refundReasonId: text('refund_reason_id').references(() => refundReasons.id, { onDelete: 'set null' }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refunds_payment_id_idx').on(t.paymentId), check('refunds_amount_pos', sql`${t.amount} > 0`)],
)

export type Refund = typeof refunds.$inferSelect
