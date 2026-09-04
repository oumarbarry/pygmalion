// tax_region (hierarchical country/province), tax_rate, tax_rate_rule.
// NO `tax_provider` table: a tax region's provider is a plain string id,
// validated applicatively against the in-memory provider registry
// (services/tax.ts) instead of a DB-backed module-loader row.
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// --- TaxRegion ----------------------------------------------------------------

export const taxRegions = pgTable(
  'tax_regions',
  {
    id: text('id').primaryKey(),
    countryCode: text('country_code').notNull(),
    // Required on a child (province) region, forbidden on a top-level one —
    // enforced applicatively (service) since "required iff parent_id is set"
    // isn't a plain NOT NULL. The CHECK below only pins the provider side.
    provinceCode: text('province_code'),
    // No `tax_provider` FK: a bare string id resolved against
    // the provider registry (`ctx.providers.get('tax', id)`) at write time.
    providerId: text('provider_id'),
    parentId: text('parent_id').references((): AnyPgColumn => taxRegions.id),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // CK_tax_region_provider_top_level: a province region can
    // never carry its own provider, only the country region it belongs to
    // does. Direct Postgres CHECK (simpler than a MikroORM
    // check since we have a real FK, no link-layer).
    check('tax_regions_provider_top_level', sql`${t.parentId} is null or ${t.providerId} is null`),
    uniqueIndex('tax_regions_country_province_unique')
      .on(t.countryCode, t.provinceCode)
      .where(sql`${t.deletedAt} is null`),
    // A single country-level (no province) region per country — the partial
    // index above alone doesn't give this: Postgres treats NULLs as distinct,
    // so two rows with the same `country_code` and `province_code = null`
    // would otherwise both pass it.
    uniqueIndex('tax_regions_country_top_level_unique')
      .on(t.countryCode)
      .where(sql`${t.deletedAt} is null and ${t.provinceCode} is null`),
    index('tax_regions_parent_id_idx').on(t.parentId),
  ],
)

export type TaxRegion = typeof taxRegions.$inferSelect

// --- TaxRate --------------------------------------------------------------

export const taxRates = pgTable(
  'tax_rates',
  {
    id: text('id').primaryKey(),
    rate: doublePrecision('rate'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    // Cumulates with the best rate of the parent (country) region instead of
    // replacing it.
    isCombinable: boolean('is_combinable').notNull().default(false),
    taxRegionId: text('tax_region_id')
      .notNull()
      .references(() => taxRegions.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // 1 default rate per region.
    uniqueIndex('tax_rates_default_unique')
      .on(t.taxRegionId)
      .where(sql`${t.isDefault} = true and ${t.deletedAt} is null`),
    index('tax_rates_tax_region_id_idx').on(t.taxRegionId),
  ],
)

export type TaxRate = typeof taxRates.$inferSelect

// --- TaxRateRule (free-text reference/reference_id targeting) -----------------

export const taxRateRules = pgTable(
  'tax_rate_rules',
  {
    id: text('id').primaryKey(),
    taxRateId: text('tax_rate_id')
      .notNull()
      .references(() => taxRates.id, { onDelete: 'cascade' }),
    // "product" | "product_type" | "shipping_option" by convention: free
    // text, no DB enum (avoids a polymorphic join table per
    // target type).
    reference: text('reference').notNull(),
    referenceId: text('reference_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tax_rate_rules_rate_reference_unique')
      .on(t.taxRateId, t.referenceId)
      .where(sql`${t.deletedAt} is null`),
    index('tax_rate_rules_reference_id_idx').on(t.referenceId),
  ],
)

export type TaxRateRule = typeof taxRateRules.$inferSelect
