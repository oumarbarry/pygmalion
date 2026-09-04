import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { carts } from './cart'
import { customerUser } from './customers'
import { shippingOptions } from './fulfillment-config'
import { stockLocations } from './inventory'
import { products, productVariants } from './products'
import { salesChannels } from './sales-channels'
import { regions } from './settings'

// Orders base. The core is MINIMAL on purpose: order, line items, addresses,
// shipping methods, an APPEND-ONLY transaction ledger, and an event journal.
// Order edits and fulfillments follow below; RMA (returns/exchanges/claims)
// lives in `schema/rma.ts`.
//
// Contra Medusa's snapshot-versioning: no `(order_id, version)` tables. Totals
// are PERSISTED at creation (cents), consistent with the cart arbitrage;
// paid/refunded are derived from `order_transactions` by SQL aggregate.
// `payment_status`/`fulfillment_status` are NEVER stored columns.

// --- OrderAddress (flat snapshot — no link back to the customer module) -------

export const orderAddresses = pgTable('order_addresses', {
  id: text('id').primaryKey(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  company: text('company'),
  address1: text('address_1'),
  address2: text('address_2'),
  city: text('city'),
  countryCode: text('country_code'),
  province: text('province'),
  postalCode: text('postal_code'),
  phone: text('phone'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type OrderAddress = typeof orderAddresses.$inferSelect

// --- Order --------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    displayId: serial('display_id').notNull(),
    cartId: text('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    regionId: text('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'restrict' }),
    customerId: text('customer_id').references(() => customerUser.id, { onDelete: 'set null' }),
    salesChannelId: text('sales_channel_id').references(() => salesChannels.id, { onDelete: 'set null' }),
    email: text('email'),
    currencyCode: text('currency_code').notNull(),
    // pending -> completed | canceled | archived | requires_action. A draft
    // order is a normal order with `is_draft_order=true` + status='draft'
    // (no separate model). payment_status/
    // fulfillment_status are DERIVED at read, never here.
    status: text('status').notNull().default('pending'),
    isDraftOrder: boolean('is_draft_order').notNull().default(false),
    shippingAddressId: text('shipping_address_id').references(() => orderAddresses.id, { onDelete: 'set null' }),
    billingAddressId: text('billing_address_id').references(() => orderAddresses.id, { onDelete: 'set null' }),
    // Persisted totals (cents), snapshot at placement.
    itemsSubtotal: integer('items_subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    shippingTotal: integer('shipping_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_customer_id_idx').on(t.customerId),
    index('orders_cart_id_idx').on(t.cartId),
    index('orders_status_idx').on(t.status),
  ],
)

export type Order = typeof orders.$inferSelect

// --- OrderLineItem (snapshot of the cart line at placement) -------------------

export const orderLineItems = pgTable(
  'order_line_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    variantId: text('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    sku: text('sku'),
    thumbnail: text('thumbnail'),
    unitPrice: integer('unit_price').notNull(),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    quantity: integer('quantity').notNull(),
    subtotal: integer('subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_line_items_order_id_idx').on(t.orderId), check('order_line_items_quantity_positive', sql`${t.quantity} > 0`)],
)

export type OrderLineItem = typeof orderLineItems.$inferSelect

// --- OrderShippingMethod ------------------------------------------------------

export const orderShippingMethods = pgTable(
  'order_shipping_methods',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    shippingOptionId: text('shipping_option_id').references(() => shippingOptions.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: integer('amount').notNull(),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    subtotal: integer('subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_shipping_methods_order_id_idx').on(t.orderId)],
)

export type OrderShippingMethod = typeof orderShippingMethods.$inferSelect

// --- OrderTransaction (APPEND-ONLY money ledger)--------------------------------
// Signed cents: positive = payment/capture, negative = refund. No status, no
// update, no delete — the financial history is immutable.

export const orderTransactions = pgTable(
  'order_transactions',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    currencyCode: text('currency_code').notNull(),
    // 'capture' | 'refund' — the kind of movement.
    reference: text('reference').notNull(),
    // id of the capture/refund/payment row this transaction mirrors.
    referenceId: text('reference_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_transactions_order_id_idx').on(t.orderId)],
)

export type OrderTransaction = typeof orderTransactions.$inferSelect

// --- OrderEvent (audit journal) ---------------------------------
// Every financial mutation records before/after amounts in `payload` so a
// dispute can be reconstructed. Replaces Medusa's OrderChange for audit only.

export const orderEvents = pgTable(
  'order_events',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_events_order_id_idx').on(t.orderId)],
)

export type OrderEvent = typeof orderEvents.$inferSelect

// --- OrderEdit (request -> confirm) -------------------------------------
// Explicit table (no Medusa OrderChange snapshot engine): the working set of
// line deltas lives in `changes` (jsonb) while `status='requested'`. Preview is
// a pure in-memory calc by the service (ZERO writes to the order
// before confirm). Confirm applies the deltas + adjusts totals + reservations
// in ONE transaction and flips `status='confirmed'`.

export interface OrderEditChanges {
  // New lines (custom or catalogue). `variantId` present + managed => reserved.
  additions: { variantId: string | null; title: string; sku: string | null; unitPrice: number; quantity: number }[]
  // Quantity changes on existing lines.
  updates: { lineItemId: string; quantity: number }[]
  // Removed lines (lineItemId[]).
  removals: string[]
}

export const orderEdits = pgTable(
  'order_edits',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('requested'), // requested | confirmed | canceled
    changes: jsonb('changes').$type<OrderEditChanges>().notNull(),
    createdBy: text('created_by'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_edits_order_id_idx').on(t.orderId), index('order_edits_status_idx').on(t.status)],
)

export type OrderEdit = typeof orderEdits.$inferSelect

// --- Fulfillment --------------------------------------------------------
// Status is DERIVED from the timestamps (packed/shipped/delivered/canceled): no
// mutable status column (derive, don't store a counter).
// `packedAt` is set at creation (a created fulfillment is "packed", Medusa
// parity). Stock is decremented + the reservation reduced AT CREATION;
// cancel re-increments stock + recreates the reservation.

export const fulfillments = pgTable(
  'fulfillments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    locationId: text('location_id').references(() => stockLocations.id, { onDelete: 'set null' }),
    providerId: text('provider_id').notNull().default('manual'),
    shippingOptionId: text('shipping_option_id').references(() => shippingOptions.id, { onDelete: 'set null' }),
    requiresShipping: boolean('requires_shipping').notNull().default(true),
    data: jsonb('data').$type<Record<string, unknown> | null>(),
    packedAt: timestamp('packed_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fulfillments_order_id_idx').on(t.orderId)],
)

export type Fulfillment = typeof fulfillments.$inferSelect

export const fulfillmentItems = pgTable(
  'fulfillment_items',
  {
    id: text('id').primaryKey(),
    fulfillmentId: text('fulfillment_id')
      .notNull()
      .references(() => fulfillments.id, { onDelete: 'cascade' }),
    lineItemId: text('line_item_id')
      .notNull()
      .references(() => orderLineItems.id, { onDelete: 'cascade' }),
    // Captured at creation so cancel can restore stock+reservation for exactly
    // the inventory item that was decremented. Null = untracked line
    // (manage_inventory=false / no reservation), nothing to restore.
    inventoryItemId: text('inventory_item_id'),
    title: text('title').notNull(),
    sku: text('sku'),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fulfillment_items_fulfillment_id_idx').on(t.fulfillmentId),
    index('fulfillment_items_line_item_id_idx').on(t.lineItemId),
    check('fulfillment_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
)

export type FulfillmentItem = typeof fulfillmentItems.$inferSelect

export const fulfillmentLabels = pgTable(
  'fulfillment_labels',
  {
    id: text('id').primaryKey(),
    fulfillmentId: text('fulfillment_id')
      .notNull()
      .references(() => fulfillments.id, { onDelete: 'cascade' }),
    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),
    labelUrl: text('label_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fulfillment_labels_fulfillment_id_idx').on(t.fulfillmentId)],
)

export type FulfillmentLabel = typeof fulfillmentLabels.$inferSelect
