import { and, desc, eq, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { pricePreferences } from '../schema/settings'
import {
  createPricePreferenceInput,
  updatePricePreferenceInput,
  type CreatePricePreferenceInput,
  type UpdatePricePreferenceInput,
} from '../validation/settings'
import type { ServiceContext } from './context'

export interface ListPricePreferencesOptions {
  limit?: number
  offset?: number
}

export function createPricePreferencesService(ctx: ServiceContext) {
  return {
    async list({ limit = 20, offset = 0 }: ListPricePreferencesOptions = {}) {
      return ctx.db
        .select()
        .from(pricePreferences)
        .where(isNull(pricePreferences.deletedAt))
        .orderBy(desc(pricePreferences.createdAt), desc(pricePreferences.id))
        .limit(limit)
        .offset(offset)
    },

    async get(id: string) {
      const [row] = await ctx.db
        .select()
        .from(pricePreferences)
        .where(and(eq(pricePreferences.id, id), isNull(pricePreferences.deletedAt)))
        .limit(1)
      return row ?? null
    },

    async create(input: CreatePricePreferenceInput) {
      const data = createPricePreferenceInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(pricePreferences)
          .values({
            id: pygId('prpref'),
            attribute: data.attribute,
            value: data.value ?? null,
            isTaxInclusive: data.isTaxInclusive ?? false,
          })
          .returning()
        await emitDomainEvent(tx, 'price-preference.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdatePricePreferenceInput) {
      const data = updatePricePreferenceInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(pricePreferences)
          .set({ isTaxInclusive: data.isTaxInclusive, updatedAt: new Date() })
          .where(and(eq(pricePreferences.id, id), isNull(pricePreferences.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'price-preference.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(pricePreferences)
          .set({ deletedAt: new Date() })
          .where(and(eq(pricePreferences.id, id), isNull(pricePreferences.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'price-preference.deleted', { id: row.id })
        return row
      })
    },
  }
}

export type PricePreferencesService = ReturnType<typeof createPricePreferencesService>
