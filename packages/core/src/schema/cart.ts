import { sql } from 'drizzle-orm'
import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { customerUser } from './customers'
import { shippingOptions } from './fulfillment-config'
import { products, productVariants } from './products'
import { promotions } from './promotions'
import { salesChannels } from './sales-channels'
import { regions } from './settings'
import { taxRates } from './tax'

// --- Cart ----------------------------------------------------------------------
// Totals are PERSISTED in cents columns, never recomputed at read time
// (unlike Medusa's `decorateCartTotals`). See services/cart-totals.ts for the
// pure pipeline that fills every `*_total`/`subtotal`/`total` column below,
// run inside the same transaction as whatever mutation triggered it.
//
// `cart_shipping_methods.shippingOptionId` carries a real FK to
// `schema/fulfillment-config.ts::shippingOptions`.
//
// `*_adjustments.promotionId` -> `promotion.id` is a real reference with
// `onDelete: 'set null'`: a deleted promotion must not wipe out the audit
// trail of a discount that was actually granted on a cart.

// --- Cart -----------------------------------------------------------------------

export const carts = pgTable(
  'carts',
  {
    id: text('id').primaryKey(),
    // Opaque cookie identity (middleware/cart-token.ts), distinct from `id` on
    // purpose: knowing a cart's id (e.g. leaked in a URL/log) alone must not
    // be enough to mutate it — only the token (or being the owning customer)
    // authorizes writes (`utils/cart.ts::requireCartAccess`).
    token: text('token').notNull(),
    customerId: text('customer_id').references(() => customerUser.id, { onDelete: 'set null' }),
    regionId: text('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'restrict' }),
    // Denormalized copy of `regions.currencyCode` at creation time (pricing
    // context needs it on every read without a join; a region has exactly one
    // currency, settings.ts).
    currencyCode: text('currency_code').notNull(),
    salesChannelId: text('sales_channel_id').references(() => salesChannels.id, { onDelete: 'set null' }),
    email: text('email'),
    // Shipping / billing address — inline columns, not a standalone Address
    // table (deliberate simplification: no reuse need beyond the cart
    // itself, unlike `customer_address`).
    shippingFirstName: text('shipping_first_name'),
    shippingLastName: text('shipping_last_name'),
    shippingCompany: text('shipping_company'),
    shippingAddress1: text('shipping_address_1'),
    shippingAddress2: text('shipping_address_2'),
    shippingCity: text('shipping_city'),
    shippingCountryCode: text('shipping_country_code'),
    shippingProvince: text('shipping_province'),
    shippingPostalCode: text('shipping_postal_code'),
    shippingPhone: text('shipping_phone'),
    billingFirstName: text('billing_first_name'),
    billingLastName: text('billing_last_name'),
    billingCompany: text('billing_company'),
    billingAddress1: text('billing_address_1'),
    billingAddress2: text('billing_address_2'),
    billingCity: text('billing_city'),
    billingCountryCode: text('billing_country_code'),
    billingProvince: text('billing_province'),
    billingPostalCode: text('billing_postal_code'),
    billingPhone: text('billing_phone'),
    // Set by the checkout when the cart completes.
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Persisted totals (cents) — written by cart-totals.ts's `sum` step.
    itemsSubtotal: integer('items_subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    shippingTotal: integer('shipping_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('carts_token_unique').on(t.token), index('carts_customer_id_idx').on(t.customerId)],
)

export type Cart = typeof carts.$inferSelect

// --- LineItem ---------------------------------------------------------------------
// Snapshot fields (title/sku/thumbnail/unitPrice/isTaxInclusive) are frozen at
// `addItem` time — a later catalog/price edit must never
// silently change what's already sitting in someone's cart.

export const cartLineItems = pgTable(
  'cart_line_items',
  {
    id: text('id').primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    variantId: text('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    sku: text('sku'),
    thumbnail: text('thumbnail'),
    unitPrice: integer('unit_price').notNull(),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    quantity: integer('quantity').notNull(),
    // Persisted per-line totals (cents) — written by cart-totals.ts.
    subtotal: integer('subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cart_line_items_cart_id_idx').on(t.cartId),
    check('cart_line_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
)

export type CartLineItem = typeof cartLineItems.$inferSelect

export const cartLineItemAdjustments = pgTable(
  'cart_line_item_adjustments',
  {
    id: text('id').primaryKey(),
    lineItemId: text('line_item_id')
      .notNull()
      .references(() => cartLineItems.id, { onDelete: 'cascade' }),
    promotionId: text('promotion_id').references(() => promotions.id, { onDelete: 'set null' }),
    code: text('code'),
    description: text('description'),
    amount: integer('amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cart_line_item_adjustments_line_item_id_idx').on(t.lineItemId),
    index('cart_line_item_adjustments_promotion_id_idx').on(t.promotionId),
    check('cart_line_item_adjustments_amount_nonneg', sql`${t.amount} >= 0`),
  ],
)

export type CartLineItemAdjustment = typeof cartLineItemAdjustments.$inferSelect

export const cartLineItemTaxLines = pgTable(
  'cart_line_item_tax_lines',
  {
    id: text('id').primaryKey(),
    lineItemId: text('line_item_id')
      .notNull()
      .references(() => cartLineItems.id, { onDelete: 'cascade' }),
    rateId: text('rate_id').references(() => taxRates.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    rate: doublePrecision('rate').notNull().default(0),
    providerId: text('provider_id').notNull(),
    amount: integer('amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cart_line_item_tax_lines_line_item_id_idx').on(t.lineItemId)],
)

export type CartLineItemTaxLine = typeof cartLineItemTaxLines.$inferSelect

// --- ShippingMethod -----------------------------------------------------------
// When `shippingOptionId` is set,
// `services/shipping.ts::resolveForCart` now looks it up for real (zone
// match, rules, price) and `name`/`amount`/`isTaxInclusive` are derived from
// that resolution, not trusted from the client — `services/cart.ts::
// setShippingMethod` and the route's request shape are unchanged (a caller
// may still omit `shippingOptionId` for a manual/custom charge, same as A).

export const cartShippingMethods = pgTable(
  'cart_shipping_methods',
  {
    id: text('id').primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    shippingOptionId: text('shipping_option_id').references(() => shippingOptions.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: integer('amount').notNull(),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    // Persisted totals (cents) — written by cart-totals.ts.
    subtotal: integer('subtotal').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    total: integer('total').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cart_shipping_methods_cart_id_idx').on(t.cartId),
    check('cart_shipping_methods_amount_nonneg', sql`${t.amount} >= 0`),
  ],
)

export type CartShippingMethod = typeof cartShippingMethods.$inferSelect

export const cartShippingMethodAdjustments = pgTable(
  'cart_shipping_method_adjustments',
  {
    id: text('id').primaryKey(),
    shippingMethodId: text('shipping_method_id')
      .notNull()
      .references(() => cartShippingMethods.id, { onDelete: 'cascade' }),
    promotionId: text('promotion_id').references(() => promotions.id, { onDelete: 'set null' }),
    code: text('code'),
    description: text('description'),
    amount: integer('amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cart_shipping_method_adjustments_shipping_method_id_idx').on(t.shippingMethodId),
    index('cart_shipping_method_adjustments_promotion_id_idx').on(t.promotionId),
  ],
)

export type CartShippingMethodAdjustment = typeof cartShippingMethodAdjustments.$inferSelect

export const cartShippingMethodTaxLines = pgTable(
  'cart_shipping_method_tax_lines',
  {
    id: text('id').primaryKey(),
    shippingMethodId: text('shipping_method_id')
      .notNull()
      .references(() => cartShippingMethods.id, { onDelete: 'cascade' }),
    rateId: text('rate_id').references(() => taxRates.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    rate: doublePrecision('rate').notNull().default(0),
    providerId: text('provider_id').notNull(),
    amount: integer('amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cart_shipping_method_tax_lines_shipping_method_id_idx').on(t.shippingMethodId)],
)

export type CartShippingMethodTaxLine = typeof cartShippingMethodTaxLines.$inferSelect

// --- CreditLine -------------------------------------------------------------
// Schema only: no service method writes to it yet (reserved for swaps/refunds).

export const cartCreditLines = pgTable(
  'cart_credit_lines',
  {
    id: text('id').primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    reference: text('reference'),
    referenceId: text('reference_id'),
    amount: integer('amount').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cart_credit_lines_cart_id_idx').on(t.cartId)],
)

export type CartCreditLine = typeof cartCreditLines.$inferSelect
