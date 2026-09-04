import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { productSalesChannel, publishableKeySalesChannel, salesChannels } from '../schema/sales-channels'
import { stores } from '../schema/settings'
import {
  createSalesChannelInput,
  updateSalesChannelInput,
  type ChannelKeysInput,
  type ChannelProductsInput,
  type CreateSalesChannelInput,
  type UpdateSalesChannelInput,
} from '../validation/sales-channels'
import type { ServiceContext } from './context'

export interface ListSalesChannelsOptions {
  limit?: number
  offset?: number
  q?: string
}

export function createSalesChannelsService(ctx: ServiceContext) {
  async function get(id: string) {
    const [row] = await ctx.db
      .select()
      .from(salesChannels)
      .where(and(eq(salesChannels.id, id), isNull(salesChannels.deletedAt)))
      .limit(1)
    return row ?? null
  }

  return {
    async list({ limit = 20, offset = 0, q }: ListSalesChannelsOptions = {}) {
      const where = q
        ? and(isNull(salesChannels.deletedAt), ilike(salesChannels.name, `%${q}%`))
        : isNull(salesChannels.deletedAt)
      return ctx.db
        .select()
        .from(salesChannels)
        .where(where)
        .orderBy(desc(salesChannels.createdAt), desc(salesChannels.id))
        .limit(limit)
        .offset(offset)
    },

    get,

    /**
     * Cheap "is there more than one active channel" check (limit 2, no
     * count(*) scan). Medusa parity: store-product filtering
     * is skipped while a store has at most one active channel — the common
     * single-channel case pays no filtering cost, and a fresh store (default
     * channel only) stays fully browsable with no publishable key configured.
     */
    async hasMultipleChannels() {
      const rows = await ctx.db
        .select({ id: salesChannels.id })
        .from(salesChannels)
        .where(isNull(salesChannels.deletedAt))
        .limit(2)
      return rows.length > 1
    },

    async create(input: CreateSalesChannelInput) {
      const data = createSalesChannelInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(salesChannels)
          .values({
            id: pygId('sc'),
            name: data.name,
            description: data.description ?? null,
            isDisabled: data.isDisabled ?? false,
            metadata: data.metadata ?? null,
          })
          .returning()
        await emitDomainEvent(tx, 'sales-channel.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateSalesChannelInput) {
      const data = updateSalesChannelInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(salesChannels)
          .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.isDisabled !== undefined ? { isDisabled: data.isDisabled } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(salesChannels.id, id), isNull(salesChannels.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'sales-channel.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        // Guard mirroring regions' protected delete: refuse rather than
        // silently orphan the store's default channel.
        const [store] = await tx.select().from(stores).where(eq(stores.defaultSalesChannelId, id)).limit(1)
        if (store) {
          throw new Error('sales-channels: cannot delete the store default sales channel')
        }
        const [row] = await tx
          .update(salesChannels)
          .set({ deletedAt: new Date() })
          .where(and(eq(salesChannels.id, id), isNull(salesChannels.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'sales-channel.deleted', { id: row.id })
        return row
      })
    },

    // --- product <-> channel -------------------------------------------------

    async listProductIds(channelId: string) {
      const rows = await ctx.db
        .select({ productId: productSalesChannel.productId })
        .from(productSalesChannel)
        .where(eq(productSalesChannel.salesChannelId, channelId))
      return rows.map((r) => r.productId)
    },

    async updateProducts(channelId: string, input: ChannelProductsInput) {
      const add = input.add ?? []
      const remove = input.remove ?? []
      await ctx.db.transaction(async (tx) => {
        if (add.length > 0) {
          await tx
            .insert(productSalesChannel)
            .values(add.map((productId) => ({ productId, salesChannelId: channelId })))
            .onConflictDoNothing()
        }
        if (remove.length > 0) {
          await tx
            .delete(productSalesChannel)
            .where(and(eq(productSalesChannel.salesChannelId, channelId), inArray(productSalesChannel.productId, remove)))
        }
        await emitDomainEvent(tx, 'sales-channel.products-updated', { id: channelId, add, remove })
      })
    },

    // --- publishable key <-> channel scoping ---------------------------------

    async listChannelIdsForKey(apiKeyId: string) {
      const rows = await ctx.db
        .select({ salesChannelId: publishableKeySalesChannel.salesChannelId })
        .from(publishableKeySalesChannel)
        .where(eq(publishableKeySalesChannel.apiKeyId, apiKeyId))
      return rows.map((r) => r.salesChannelId)
    },

    async updateKeyChannels(apiKeyId: string, input: ChannelKeysInput) {
      const add = input.add ?? []
      const remove = input.remove ?? []
      await ctx.db.transaction(async (tx) => {
        if (add.length > 0) {
          await tx
            .insert(publishableKeySalesChannel)
            .values(add.map((salesChannelId) => ({ apiKeyId, salesChannelId })))
            .onConflictDoNothing()
        }
        if (remove.length > 0) {
          await tx
            .delete(publishableKeySalesChannel)
            .where(
              and(eq(publishableKeySalesChannel.apiKeyId, apiKeyId), inArray(publishableKeySalesChannel.salesChannelId, remove)),
            )
        }
        await emitDomainEvent(tx, 'api-key.sales-channels-updated', { apiKeyId, add, remove })
      })
    },

    // --- store default channel ------------------------------------------------

    async getDefaultChannel() {
      const [store] = await ctx.db.select().from(stores).where(isNull(stores.deletedAt)).limit(1)
      if (!store?.defaultSalesChannelId) return null
      return get(store.defaultSalesChannelId)
    },

    /** Boot-time: the store always has a default sales channel (idempotent, like `stores.ensure()`). */
    async ensureDefaultChannel() {
      const [store] = await ctx.db.select().from(stores).where(isNull(stores.deletedAt)).limit(1)
      if (!store) return null
      if (store.defaultSalesChannelId) return get(store.defaultSalesChannelId)
      return ctx.db.transaction(async (tx) => {
        const [channel] = await tx
          .insert(salesChannels)
          .values({ id: pygId('sc'), name: 'Default Sales Channel' })
          .returning()
        await tx.update(stores).set({ defaultSalesChannelId: channel.id }).where(eq(stores.id, store.id))
        await emitDomainEvent(tx, 'sales-channel.created', { id: channel.id })
        return channel
      })
    },
  }
}

export type SalesChannelsService = ReturnType<typeof createSalesChannelsService>
