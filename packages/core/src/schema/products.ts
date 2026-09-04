import { sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Catalog core. Deliberate deviation: 1 option = 1 product (no
// shared/exclusive options, no ProductProductOption pivot). Taxonomy
// (collections, categories, tags) lives in `schema/taxonomy.ts`, FK'd to
// `products.id`; nothing here references it.

export const productStatus = pgEnum('product_status', ['draft', 'proposed', 'published', 'rejected'])

// --- Product ------------------------------------------------------------------

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description'),
    handle: text('handle').notNull(),
    status: productStatus('status').notNull().default('draft'),
    thumbnail: text('thumbnail'),
    weight: doublePrecision('weight'),
    length: doublePrecision('length'),
    height: doublePrecision('height'),
    width: doublePrecision('width'),
    originCountry: text('origin_country'),
    hsCode: text('hs_code'),
    midCode: text('mid_code'),
    material: text('material'),
    isGiftcard: boolean('is_giftcard').notNull().default(false),
    // Forced false whenever isGiftcard is true (service rule).
    discountable: boolean('discountable').notNull().default(true),
    externalId: text('external_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Handle unique among live rows only (soft-delete frees the handle).
    uniqueIndex('products_handle_active_unique').on(t.handle).where(sql`${t.deletedAt} is null`),
    index('products_status_idx').on(t.status),
  ],
)

export type Product = typeof products.$inferSelect

// --- ProductOption / ProductOptionValue (1 option = 1 product, arbitrage) ----

export const productOptions = pgTable(
  'product_options',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_options_product_id_idx').on(t.productId)],
)

export type ProductOption = typeof productOptions.$inferSelect

export const productOptionValues = pgTable(
  'product_option_values',
  {
    id: text('id').primaryKey(),
    optionId: text('option_id')
      .notNull()
      .references(() => productOptions.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    rank: integer('rank').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('product_option_values_option_value_unique').on(t.optionId, t.value)],
)

export type ProductOptionValue = typeof productOptionValues.$inferSelect

// --- ProductVariant -------------------------------------------------------------

export const productVariants = pgTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    ean: text('ean'),
    upc: text('upc'),
    allowBackorder: boolean('allow_backorder').notNull().default(false),
    manageInventory: boolean('manage_inventory').notNull().default(true),
    hsCode: text('hs_code'),
    midCode: text('mid_code'),
    originCountry: text('origin_country'),
    material: text('material'),
    weight: doublePrecision('weight'),
    length: doublePrecision('length'),
    height: doublePrecision('height'),
    width: doublePrecision('width'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    variantRank: integer('variant_rank').notNull().default(0),
    thumbnail: text('thumbnail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('product_variants_product_id_idx').on(t.productId),
    // Global uniqueness (all products) while live; soft-delete frees the
    // code for reuse. Postgres unique indexes already treat
    // NULL as distinct, so no extra `is not null` guard is needed.
    uniqueIndex('product_variants_sku_active_unique').on(t.sku).where(sql`${t.deletedAt} is null`),
    uniqueIndex('product_variants_barcode_active_unique').on(t.barcode).where(sql`${t.deletedAt} is null`),
    uniqueIndex('product_variants_ean_active_unique').on(t.ean).where(sql`${t.deletedAt} is null`),
    uniqueIndex('product_variants_upc_active_unique').on(t.upc).where(sql`${t.deletedAt} is null`),
  ],
)

export type ProductVariant = typeof productVariants.$inferSelect

// Variant <-> option value combination (exactly one value per
// product option, unique combination per product).
export const productVariantOptions = pgTable(
  'product_variant_options',
  {
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    optionValueId: text('option_value_id')
      .notNull()
      .references(() => productOptionValues.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.optionValueId] })],
)

// --- ProductImage ---------------------------------------------------------------
// `url` holds an unstorage key (`useStorage('pygmalion:files')`, fs driver by
// default in the playground), not a raw provider URL.

export const productImages = pgTable(
  'product_images',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    rank: integer('rank').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_images_product_id_idx').on(t.productId)],
)

export type ProductImage = typeof productImages.$inferSelect

// Variant <-> image: which images belong to
// which variant, independent of the product-level rank order.
export const productVariantImages = pgTable(
  'product_variant_images',
  {
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    imageId: text('image_id')
      .notNull()
      .references(() => productImages.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.imageId] })],
)
