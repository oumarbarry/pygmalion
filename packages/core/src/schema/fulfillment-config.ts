import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { products } from './products'

// --- Shipping ------------------------------------------------------------
// Shipping CONFIG only: `fulfillment_set -> service_zone -> geo_zone`,
// `shipping_profile` (+ product link), `shipping_option` (+ rules).
// Fulfillment EXECUTION (fulfillments and their items) lives in
// `schema/orders.ts`. The `price_type: calculated` MECHANISM is ported; the
// built-in `manual` provider just never supports it (services/shipping.ts,
// parity with Medusa's `fulfillment-manual`).
//
// Geo zone field requirements (province required unless type=country, city
// required when type=city, postalExpression required when type=zip) are
// service-layer checks (`services/shipping.ts`), not DB CHECKs — same
// precedent as `tax_regions` (province/provider pairing enforced in
// `services/tax.ts`, not a CHECK, because it depends on a sibling column).

export const geoZoneType = pgEnum('geo_zone_type', ['country', 'province', 'city', 'zip'])
export const shippingPriceType = pgEnum('shipping_price_type', ['flat', 'calculated'])
export const shippingOptionRuleOperator = pgEnum('shipping_option_rule_operator', [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
])

// --- FulfillmentSet -> ServiceZone -> GeoZone -----------------------------------

export const fulfillmentSets = pgTable(
  'fulfillment_sets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('fulfillment_sets_name_active_unique').on(t.name).where(sql`${t.deletedAt} is null`)],
)

export type FulfillmentSet = typeof fulfillmentSets.$inferSelect

export const serviceZones = pgTable(
  'service_zones',
  {
    id: text('id').primaryKey(),
    fulfillmentSetId: text('fulfillment_set_id')
      .notNull()
      .references(() => fulfillmentSets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('service_zones_fulfillment_set_id_idx').on(t.fulfillmentSetId),
    uniqueIndex('service_zones_name_active_unique').on(t.name).where(sql`${t.deletedAt} is null`),
  ],
)

export type ServiceZone = typeof serviceZones.$inferSelect

export const geoZones = pgTable(
  'geo_zones',
  {
    id: text('id').primaryKey(),
    serviceZoneId: text('service_zone_id')
      .notNull()
      .references(() => serviceZones.id, { onDelete: 'cascade' }),
    type: geoZoneType('type').notNull(),
    countryCode: text('country_code').notNull(),
    provinceCode: text('province_code'),
    city: text('city'),
    // Simple postal rule: `{ codes: [...] }` exact list OR `{ prefix: '75' }`
    // prefix match, no full expression/regex grammar. Extend the shape here
    // if a real carrier integration ever needs range matching.
    postalExpression: jsonb('postal_expression').$type<{ codes?: string[]; prefix?: string } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('geo_zones_service_zone_id_idx').on(t.serviceZoneId)],
)

export type GeoZone = typeof geoZones.$inferSelect

// --- ShippingProfile (+ product link) -------------------------------------------
// One profile per product max (`shippingProfileProducts` PKs on `productId`
// alone) — a product with no row here falls back to the default profile
// (`services/shipping.ts::ensureDefaultProfile`), mirroring how
// `salesChannels.ensureDefaultChannel` seeds the store's default channel.

export const shippingProfiles = pgTable(
  'shipping_profiles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('shipping_profiles_name_active_unique').on(t.name).where(sql`${t.deletedAt} is null`),
    // At most one default profile (pattern: `store_currencies_default_unique`, schema/settings.ts).
    uniqueIndex('shipping_profiles_default_unique').on(t.isDefault).where(sql`${t.isDefault} = true`),
  ],
)

export type ShippingProfile = typeof shippingProfiles.$inferSelect

export const shippingProfileProducts = pgTable(
  'shipping_profile_products',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    shippingProfileId: text('shipping_profile_id')
      .notNull()
      .references(() => shippingProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId] }), index('shipping_profile_products_profile_id_idx').on(t.shippingProfileId)],
)

export type ShippingProfileProduct = typeof shippingProfileProducts.$inferSelect

// --- ShippingOption (+ rules) ----------------------------------------------------

export const shippingOptions = pgTable(
  'shipping_options',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    serviceZoneId: text('service_zone_id')
      .notNull()
      .references(() => serviceZones.id, { onDelete: 'cascade' }),
    shippingProfileId: text('shipping_profile_id')
      .notNull()
      .references(() => shippingProfiles.id, { onDelete: 'restrict' }),
    // Not a DB FK: providers are runtime-registered, same weak-ref
    // pattern as `tax_regions.provider_id`. Defaults to
    // the built-in `manual` provider (services/shipping.ts), validated
    // against the registry applicatively at create/update time.
    providerId: text('provider_id').notNull().default('manual'),
    priceType: shippingPriceType('price_type').notNull().default('flat'),
    // Opaque provider config, e.g. a carrier
    // service code. Never interpreted by core, only threaded through to
    // whatever provider `providerId` resolves to.
    data: jsonb('data').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('shipping_options_service_zone_id_idx').on(t.serviceZoneId),
    index('shipping_options_shipping_profile_id_idx').on(t.shippingProfileId),
  ],
)

export type ShippingOption = typeof shippingOptions.$inferSelect

// Simple eligibility rules: strict AND, same convention as
// `price_rules`/`tax_rate_rules` — every rule on an option must match for it
// to be eligible. `value` is a number for eq/ne/gt/gte/lt/lte, a number[] for
// `in` (see `services/shipping.ts::ruleMatches`).

export const shippingOptionRules = pgTable(
  'shipping_option_rules',
  {
    id: text('id').primaryKey(),
    shippingOptionId: text('shipping_option_id')
      .notNull()
      .references(() => shippingOptions.id, { onDelete: 'cascade' }),
    attribute: text('attribute').notNull(),
    operator: shippingOptionRuleOperator('operator').notNull().default('eq'),
    value: jsonb('value').$type<number | number[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shipping_option_rules_shipping_option_id_idx').on(t.shippingOptionId)],
)

export type ShippingOptionRule = typeof shippingOptionRules.$inferSelect
