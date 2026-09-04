import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { salesChannels } from './sales-channels'

// --- Currency (ISO reference data, seeded at boot, read-only) -------------

export const currencies = pgTable('currencies', {
  code: text('code').primaryKey(),
  symbol: text('symbol').notNull(),
  symbolNative: text('symbol_native').notNull(),
  name: text('name').notNull(),
  decimalDigits: integer('decimal_digits').notNull().default(0),
  rounding: integer('rounding').notNull().default(0),
})

export type Currency = typeof currencies.$inferSelect

// --- Region -----------------------------------------------------------------

export const regions = pgTable('regions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  automaticTaxes: boolean('automatic_taxes').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type Region = typeof regions.$inferSelect

// --- RegionCountry ------------------------------------------------------------
// Static world-country catalog seeded at boot (like `currencies`); `iso2` is
// the PK so each country has exactly one row and one `regionId` — that alone
// gives "a country belongs to at most one region" for free, no extra unique
// index needed. `onDelete: 'restrict'` blocks deleting a region while it still
// owns countries — the same FK shape any future domain (cart/order) reuses
// against `regions.id` once it exists, per the plan's protected-delete rule.

export const regionCountries = pgTable('region_country', {
  iso2: text('iso_2').primaryKey(),
  iso3: text('iso_3').notNull(),
  numCode: text('num_code').notNull(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'restrict' }),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
})

export type RegionCountry = typeof regionCountries.$inferSelect

// --- Store (singleton) --------------------------------------------------------
// `singleton` is always `true`; the partial unique index below permits at most
// one live (non soft-deleted) row — cheaper than an app-level existence check
// racing a concurrent insert.

export const stores = pgTable(
  'stores',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().default('Pygmalion Store'),
    defaultRegionId: text('default_region_id').references(() => regions.id, { onDelete: 'set null' }),
    defaultSalesChannelId: text('default_sales_channel_id').references(() => salesChannels.id, { onDelete: 'set null' }),
    // No FK: plain reference to a stock-location id.
    defaultLocationId: text('default_location_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    singleton: boolean('singleton').notNull().default(true),
  },
  (t) => [
    uniqueIndex('stores_singleton_unique').on(t.singleton).where(sql`${t.deletedAt} is null`),
  ],
)

export type Store = typeof stores.$inferSelect

// --- StoreCurrency ------------------------------------------------------------

export const storeCurrencies = pgTable(
  'store_currencies',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('store_currencies_store_currency_unique').on(t.storeId, t.currencyCode),
    // At most one default currency per store.
    uniqueIndex('store_currencies_default_unique').on(t.storeId).where(sql`${t.isDefault} = true`),
  ],
)

export type StoreCurrency = typeof storeCurrencies.$inferSelect

// --- PricePreference (tax inclusive per region/devise) — porte tel quel -------

export const pricePreferences = pgTable(
  'price_preferences',
  {
    id: text('id').primaryKey(),
    // Free text ported as-is from Medusa; app-level (zod) restricts it to
    // `region_id` | `currency_code` — no DB enum, matches upstream exactly.
    attribute: text('attribute').notNull(),
    value: text('value'),
    isTaxInclusive: boolean('is_tax_inclusive').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('price_preferences_attribute_value_unique')
      .on(t.attribute, t.value)
      .where(sql`${t.deletedAt} is null`),
  ],
)

export type PricePreference = typeof pricePreferences.$inferSelect
