import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { productVariants } from './products'
import { currencies } from './settings'
import { shippingOptions } from './fulfillment-config'

// --- Pricing ------------------------------------------------------------
// PriceSet is merged into `prices` (nullable variantId/shippingOptionId FKs +
// an exactly-one CHECK): no PriceSet entity, no polymorphic link table
// (Medusa isolates the module; Pygmalion has one relational schema). No
// `priority` column on rules (dead in Medusa, never read by `calculatePrices`).

// Closed enum: Pygmalion knows its own cart/customer context, so `attribute`
// is not free text as in Medusa, just the 3 keys `calculatePrices` can
// compare. `quantity` has its own dedicated columns on `prices` (min/max),
// not a rule.
export const priceRuleAttribute = pgEnum('price_rule_attribute', ['region_id', 'currency_code', 'customer_group_id'])
export const pricingRuleOperator = pgEnum('pricing_rule_operator', ['eq', 'gt', 'gte', 'lt', 'lte'])
export const priceListStatus = pgEnum('price_list_status', ['draft', 'active'])
export const priceListType = pgEnum('price_list_type', ['sale', 'override'])

// --- PriceList ------------------------------------------------------------------

export const priceLists = pgTable('price_lists', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: priceListStatus('status').notNull().default('draft'),
  type: priceListType('type').notNull().default('sale'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  // Denormalized: counts the price_list_rules so the service knows how many
  // rules must match (strict AND) without a separate COUNT.
  rulesCount: integer('rules_count').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type PriceList = typeof priceLists.$inferSelect

// Condition on the whole list: `value` is an array (containment), not a
// plain text like `price_rules.value`.
export const priceListRules = pgTable(
  'price_list_rules',
  {
    id: text('id').primaryKey(),
    priceListId: text('price_list_id')
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    attribute: priceRuleAttribute('attribute').notNull(),
    value: jsonb('value').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_list_rules_price_list_id_idx').on(t.priceListId),
    uniqueIndex('price_list_rules_list_attribute_unique').on(t.priceListId, t.attribute),
  ],
)

export type PriceListRule = typeof priceListRules.$inferSelect

// --- Price (PriceSet merged in) ---------------------------------------------------

export const prices = pgTable(
  'prices',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    variantId: text('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
    shippingOptionId: text('shipping_option_id').references(() => shippingOptions.id, { onDelete: 'cascade' }),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    // Integer cents, never float.
    amount: integer('amount').notNull(),
    minQuantity: integer('min_quantity'),
    maxQuantity: integer('max_quantity'),
    priceListId: text('price_list_id').references(() => priceLists.id, { onDelete: 'cascade' }),
    // Denormalized: see priceLists.rulesCount.
    rulesCount: integer('rules_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('prices_variant_id_idx').on(t.variantId),
    index('prices_shipping_option_id_idx').on(t.shippingOptionId),
    index('prices_price_list_id_idx').on(t.priceListId),
    index('prices_currency_code_idx').on(t.currencyCode),
    // Exactly-one owner, DB-level so a bad insert from
    // any caller (not just this service) is rejected.
    check('prices_exactly_one_owner', sql`(${t.variantId} is not null) <> (${t.shippingOptionId} is not null)`),
  ],
)

export type Price = typeof prices.$inferSelect

// Condition on one specific Price.
export const priceRules = pgTable(
  'price_rules',
  {
    id: text('id').primaryKey(),
    priceId: text('price_id')
      .notNull()
      .references(() => prices.id, { onDelete: 'cascade' }),
    attribute: priceRuleAttribute('attribute').notNull(),
    value: text('value').notNull(),
    operator: pricingRuleOperator('operator').notNull().default('eq'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_rules_price_id_idx').on(t.priceId),
    uniqueIndex('price_rules_price_attribute_operator_unique').on(t.priceId, t.attribute, t.operator),
  ],
)

export type PriceRule = typeof priceRules.$inferSelect
