import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { products } from './products'
import { staffApiKey } from './staff'

// --- SalesChannel -------------------------------------------------------------
// Deliberately thin (Medusa parity): name/description/is_disabled/
// metadata, no hierarchy. Product<->channel and publishable-key<->channel are
// direct FK join tables (no link-module layer).

export const salesChannels = pgTable(
  'sales_channels',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    isDisabled: boolean('is_disabled').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sales_channels_name_active_unique').on(t.name).where(sql`${t.deletedAt} is null`),
  ],
)

export type SalesChannel = typeof salesChannels.$inferSelect

// --- ProductSalesChannel --------------------------------------------------------
// Which products are sellable on which channel (Medusa's `product-sales-channel`
// link, ported as a direct join table).

export const productSalesChannel = pgTable(
  'product_sales_channel',
  {
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    salesChannelId: text('sales_channel_id').notNull().references(() => salesChannels.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.salesChannelId] })],
)

// --- PublishableKeySalesChannel --------------------------------------------------
// Scoping Pygmalion adds on top of the better-auth `api-key` plugin's own table
// (`staff_api_key`: the same table holds both secret and publishable keys,
// distinguished by `prefix`: `sk_`/`pk_`, set at creation). The plugin covers
// hash/revocation, this join table is ours.

export const publishableKeySalesChannel = pgTable(
  'publishable_key_sales_channel',
  {
    apiKeyId: text('api_key_id').notNull().references(() => staffApiKey.id, { onDelete: 'cascade' }),
    salesChannelId: text('sales_channel_id').notNull().references(() => salesChannels.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.salesChannelId] })],
)
