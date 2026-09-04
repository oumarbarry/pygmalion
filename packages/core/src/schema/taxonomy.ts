// product_collection, product_category (mpath tree), product_tag
// + join tables to `products` (FK to `products.id` only).
import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { products } from './products'

// --- ProductCollection --------------------------------------------------------

export const productCollections = pgTable(
  'product_collections',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    handle: text('handle').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('product_collections_handle_active_unique').on(t.handle).where(sql`${t.deletedAt} is null`),
  ],
)

export type ProductCollection = typeof productCollections.$inferSelect

// Medusa models product->collection as a `belongsTo` (a product has at most one
// collection). Ported here as a join table keyed on `productId`, which encodes
// the same "at most one" cardinality without adding a column to `products`
// itself: inserting a new row for a product that already has one reassigns
// it (`onConflictDoUpdate`).
export const productCollectionProduct = pgTable('product_collection_product', {
  productId: text('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  collectionId: text('collection_id')
    .notNull()
    .references(() => productCollections.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- ProductCategory (materialized path tree) ---------------------------------

export const productCategories = pgTable(
  'product_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    handle: text('handle').notNull(),
    // Materialized path e.g. "pcat_a.pcat_b.pcat_c", ported as-is from Medusa:
    // text + index reproduces the proven behaviour without
    // introducing `ltree`. Recomputed for the whole subtree on move (service).
    mpath: text('mpath').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    isInternal: boolean('is_internal').notNull().default(false),
    rank: integer('rank').notNull().default(0),
    // Self-referencing FK, no onDelete: cascade *soft*-delete of descendants is
    // handled explicitly by the service (a DB-level cascade would hard-delete).
    parentCategoryId: text('parent_category_id').references((): AnyPgColumn => productCategories.id),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('product_categories_handle_active_unique').on(t.handle).where(sql`${t.deletedAt} is null`),
  ],
)

export type ProductCategory = typeof productCategories.$inferSelect

export const productCategoryProduct = pgTable(
  'product_category_product',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => productCategories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })],
)

// --- ProductTag ----------------------------------------------------------------

export const productTags = pgTable(
  'product_tags',
  {
    id: text('id').primaryKey(),
    value: text('value').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('product_tags_value_active_unique').on(t.value).where(sql`${t.deletedAt} is null`)],
)

export type ProductTag = typeof productTags.$inferSelect

export const productTagProduct = pgTable(
  'product_tag_product',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => productTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.tagId] })],
)
