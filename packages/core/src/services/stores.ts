import { and, eq, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { storeCurrencies, stores } from '../schema/settings'
import {
  setSupportedCurrenciesInput,
  updateStoreInput,
  type SetSupportedCurrenciesInput,
  type UpdateStoreInput,
} from '../validation/settings'
import type { ServiceContext } from './context'

async function getStore(ctx: ServiceContext) {
  const [row] = await ctx.db.select().from(stores).where(isNull(stores.deletedAt)).limit(1)
  return row ?? null
}

export function createStoresService(ctx: ServiceContext) {
  return {
    /** The one store row, or `null` before boot has run `ensure()`. */
    async get() {
      return getStore(ctx)
    },

    /** Medusa parity: `GET /admin/stores` returns a list (usually one row). */
    async list() {
      return ctx.db.select().from(stores).where(isNull(stores.deletedAt))
    },

    /**
     * Boot-time singleton creation, idempotent AND race-safe:
     * two concurrent boots both passed the check-then-insert and the loser
     * died on `stores_singleton_unique`. The insert now absorbs the conflict
     * and re-reads; the event is only emitted by the boot that really created.
     */
    async ensure() {
      const existing = await getStore(ctx)
      if (existing) return existing
      const created = await ctx.db.transaction(async (tx) => {
        const [row] = await tx.insert(stores).values({ id: pygId('store') }).onConflictDoNothing().returning()
        if (row) await emitDomainEvent(tx, 'store.created', { id: row.id })
        return row ?? null
      })
      return created ?? (await getStore(ctx))!
    },

    async update(id: string, input: UpdateStoreInput) {
      const data = updateStoreInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(stores)
          .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.defaultRegionId !== undefined ? { defaultRegionId: data.defaultRegionId } : {}),
            ...(data.defaultSalesChannelId !== undefined
              ? { defaultSalesChannelId: data.defaultSalesChannelId }
              : {}),
            ...(data.defaultLocationId !== undefined ? { defaultLocationId: data.defaultLocationId } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(stores.id, id), isNull(stores.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'store.updated', { id: row.id })
        return row
      })
    },

    /** Full replace of the store's supported currencies (Medusa: `supported_currencies[]`). */
    async setSupportedCurrencies(id: string, input: SetSupportedCurrenciesInput) {
      const list = setSupportedCurrenciesInput.parse(input)
      const defaults = list.filter((c) => c.isDefault)
      if (defaults.length > 1) {
        throw new Error('stores: only one supported currency can be the default')
      }
      return ctx.db.transaction(async (tx) => {
        await tx.delete(storeCurrencies).where(eq(storeCurrencies.storeId, id))
        if (list.length > 0) {
          await tx.insert(storeCurrencies).values(
            list.map((c, i) => ({
              id: pygId('stocur'),
              storeId: id,
              currencyCode: c.code,
              // No explicit default given → the first entry wins, matching
              // "some currency must be the default" without forcing callers
              // to think about it on every write.
              isDefault: defaults.length > 0 ? c.isDefault === true : i === 0,
            })),
          )
        }
        await emitDomainEvent(tx, 'store.updated', { id })
        return tx.select().from(storeCurrencies).where(eq(storeCurrencies.storeId, id))
      })
    },
  }
}

export type StoresService = ReturnType<typeof createStoresService>
