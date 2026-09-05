import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { productVariants } from './products'

// Inventory + stock locations. Key rule: `reserved_quantity`/`available_quantity`
// are NEVER stored columns, always a SQL aggregate over `reservationItems`
// computed in the service layer (`services/inventory.ts`), to avoid a mutable
// counter that can drift from the reservation rows it's supposed to summarize.

// --- StockLocationAddress / StockLocation ------------------------------------
// ponytail: the address is managed inline through the stock-location service (no
// standalone address CRUD). Medusa's cascade direction (delete address ->
// delete location) doesn't fit the soft-delete convention used everywhere
// else here, so `addressId` is nulled on delete instead (location loses its
// address, stays alive) and the service always writes/deletes the address
// together with its location.

export const stockLocationAddresses = pgTable('stock_location_addresses', {
  id: text('id').primaryKey(),
  address1: text('address_1').notNull(),
  address2: text('address_2'),
  city: text('city'),
  countryCode: text('country_code').notNull(),
  province: text('province'),
  postalCode: text('postal_code'),
  phone: text('phone'),
  company: text('company'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type StockLocationAddress = typeof stockLocationAddresses.$inferSelect

export const stockLocations = pgTable(
  'stock_locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    addressId: text('address_id').references(() => stockLocationAddresses.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('stock_locations_name_active_unique').on(t.name).where(sql`${t.deletedAt} is null`)],
)

export type StockLocation = typeof stockLocations.$inferSelect

// --- InventoryItem ------------------------------------------------------------
// No `title` (Medusa parity: identified by sku + dimensions, not a display
// name). `requiresShipping` defaults true (physical good).

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: text('id').primaryKey(),
    sku: text('sku'),
    weight: integer('weight'),
    length: integer('length'),
    height: integer('height'),
    width: integer('width'),
    originCountry: text('origin_country'),
    hsCode: text('hs_code'),
    midCode: text('mid_code'),
    requiresShipping: boolean('requires_shipping').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('inventory_items_sku_active_unique').on(t.sku).where(sql`${t.deletedAt} is null`)],
)

export type InventoryItem = typeof inventoryItems.$inferSelect

// --- InventoryLevel (per item x location) --------------------------------------
// `stockedQuantity`/`incomingQuantity` are the only mutable counters this
// domain owns; `reservedQuantity`/`availableQuantity` are computed, never
// persisted here.

export const inventoryLevels = pgTable(
  'inventory_levels',
  {
    id: text('id').primaryKey(),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'cascade' }),
    stockedQuantity: integer('stocked_quantity').notNull().default(0),
    incomingQuantity: integer('incoming_quantity').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inventory_levels_item_location_unique').on(t.inventoryItemId, t.locationId),
    index('inventory_levels_location_idx').on(t.locationId),
  ],
)

export type InventoryLevel = typeof inventoryLevels.$inferSelect

// --- ReservationItem ------------------------------------------------------------
// Hard-deleted on release/full-consumption: no `deletedAt`, so the SUM
// aggregate in `services/inventory.ts` never needs an `is null` filter to
// stay correct. `allowBackorder` is copied from the variant at creation time
// (traceability: the variant's flag can change later without rewriting history).

export const reservationItems = pgTable(
  'reservation_items',
  {
    id: text('id').primaryKey(),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    lineItemId: text('line_item_id'),
    allowBackorder: boolean('allow_backorder').notNull().default(false),
    externalId: text('external_id'),
    description: text('description'),
    createdBy: text('created_by'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reservation_items_inventory_item_idx').on(t.inventoryItemId),
    index('reservation_items_location_idx').on(t.locationId),
    index('reservation_items_line_item_idx').on(t.lineItemId),
  ],
)

export type ReservationItem = typeof reservationItems.$inferSelect

// --- ProductVariant <-> InventoryItem (kits) --------------------
// `requiredQuantity` = how many units of this inventory item one unit of the
// variant consumes (kit support). Reservation/decrement/release always
// reason in `inventoryItemId`, never in `variantId` directly, past this join.

export const variantInventoryItems = pgTable(
  'variant_inventory_items',
  {
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    requiredQuantity: integer('required_quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.inventoryItemId] })],
)

export type VariantInventoryItem = typeof variantInventoryItems.$inferSelect
