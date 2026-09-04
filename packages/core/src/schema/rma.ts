import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { stockLocations } from './inventory'
import { productVariants } from './products'
import { orderLineItems, orders } from './orders'

// RMA domain (returns, exchanges, claims). Explicit FK tables, NO Medusa
// order-change snapshot engine: every mutation is a direct UPDATE inside one
// transaction, guarded by the concurrency law (lock the order/return row,
// conditional-claim the status).
//
// The "inbound leg = Return" pattern: a return can stand alone OR be
// the inbound leg of an exchange (`return.exchange_id`) / claim
// (`return.claim_id`), so one receive-and-restock code path serves all three.
// Money never lives here: refunds go through the payment ledger
// (order_transaction append-only); this domain only records
// quantities + the `refund_amount` the admin intends.

// --- ReturnReason (admin CRUD referential) ------------------------------------

export const returnReasons = pgTable(
  'return_reasons',
  {
    id: text('id').primaryKey(),
    value: text('value').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    parentReturnReasonId: text('parent_return_reason_id').references((): AnyPgColumn => returnReasons.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('return_reasons_value_active_unique').on(t.value).where(sql`${t.deletedAt} is null`)],
)

export type ReturnReason = typeof returnReasons.$inferSelect

// --- Exchange (outbound = new order lines; inbound = a linked Return) ----------

export const exchanges = pgTable(
  'exchanges',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Signed cents (settled at complete): > 0 = customer still owes (deferred
    // collection), < 0 = to refund via the payment ledger, 0 = even swap.
    differenceDue: integer('difference_due'),
    status: text('status').notNull().default('requested'), // requested | completed | canceled
    createdBy: text('created_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('exchanges_order_id_idx').on(t.orderId), index('exchanges_status_idx').on(t.status)],
)

export type Exchange = typeof exchanges.$inferSelect

// OrderExchangeItem — the OUTBOUND (replacement) lines. Materialized as real
// `order_line_items` at create (reserved like an edit-addition) so they flow
// through the normal fulfillment pipeline; `lineItemId` links back to that row.
export const exchangeItems = pgTable(
  'exchange_items',
  {
    id: text('id').primaryKey(),
    exchangeId: text('exchange_id')
      .notNull()
      .references(() => exchanges.id, { onDelete: 'cascade' }),
    lineItemId: text('line_item_id').references(() => orderLineItems.id, { onDelete: 'set null' }),
    variantId: text('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    sku: text('sku'),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('exchange_items_exchange_id_idx').on(t.exchangeId), check('exchange_items_quantity_positive', sql`${t.quantity} > 0`)],
)

export type ExchangeItem = typeof exchangeItems.$inferSelect

// --- Claim (replace | refund) --------------------------------------------------

export const claims = pgTable(
  'claims',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // replace | refund
    status: text('status').notNull().default('requested'), // requested | completed | canceled
    refundAmount: integer('refund_amount'),
    createdBy: text('created_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('claims_order_id_idx').on(t.orderId), index('claims_status_idx').on(t.status)],
)

export type Claim = typeof claims.$inferSelect

// OrderClaimItem — existing order lines flagged with a claim reason + photos.
// For a `replace` claim, replacement (outbound) lines are `exchange_items`-style
// order_line_items carrying `metadata.claimId`; the inbound leg (if any) is a
// linked Return (`return.claim_id`).
export const claimItems = pgTable(
  'claim_items',
  {
    id: text('id').primaryKey(),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id, { onDelete: 'cascade' }),
    lineItemId: text('line_item_id')
      .notNull()
      .references(() => orderLineItems.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(), // missing_item | wrong_item | production_failure | other
    quantity: integer('quantity').notNull(),
    images: jsonb('images').$type<string[] | null>(),
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('claim_items_claim_id_idx').on(t.claimId), check('claim_items_quantity_positive', sql`${t.quantity} > 0`)],
)

export type ClaimItem = typeof claimItems.$inferSelect

// --- Return (+ items) ----------------------------------------------------------
// Defined last: `exchange_id`/`claim_id` reference the tables above (the
// inbound-leg pattern). A standalone return leaves both null.

export const returns = pgTable(
  'returns',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    exchangeId: text('exchange_id').references(() => exchanges.id, { onDelete: 'cascade' }),
    claimId: text('claim_id').references(() => claims.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('requested'), // requested | partially_received | received | canceled
    locationId: text('location_id').references(() => stockLocations.id, { onDelete: 'set null' }),
    // Cents the admin intends to refund on full receipt (via the payment ledger).
    refundAmount: integer('refund_amount'),
    createdBy: text('created_by'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('returns_order_id_idx').on(t.orderId),
    index('returns_exchange_id_idx').on(t.exchangeId),
    index('returns_claim_id_idx').on(t.claimId),
    index('returns_status_idx').on(t.status),
  ],
)

export type Return = typeof returns.$inferSelect

export const returnItems = pgTable(
  'return_items',
  {
    id: text('id').primaryKey(),
    returnId: text('return_id')
      .notNull()
      .references(() => returns.id, { onDelete: 'cascade' }),
    lineItemId: text('line_item_id')
      .notNull()
      .references(() => orderLineItems.id, { onDelete: 'cascade' }),
    reasonId: text('reason_id').references(() => returnReasons.id, { onDelete: 'set null' }),
    requestedQuantity: integer('requested_quantity').notNull(),
    receivedQuantity: integer('received_quantity').notNull().default(0),
    damagedQuantity: integer('damaged_quantity').notNull().default(0),
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('return_items_return_id_idx').on(t.returnId), check('return_items_requested_positive', sql`${t.requestedQuantity} > 0`)],
)

export type ReturnItem = typeof returnItems.$inferSelect
