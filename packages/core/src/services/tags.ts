import { and, desc, eq, getTableColumns, ilike, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { products } from '../schema/products'
import { productTagProduct, productTags } from '../schema/taxonomy'
import {
  createTagInput,
  updateTagInput,
  type CreateTagInput,
  type UpdateTagInput,
} from '../validation/taxonomy'
import type { ServiceContext } from './context'

export interface ListTagsOptions {
  limit?: number
  offset?: number
  q?: string
}

export interface ListStorefrontProductsOptions {
  limit?: number
  offset?: number
}

export function createTagsService(ctx: ServiceContext) {
  async function get(id: string) {
    const [row] = await ctx.db
      .select()
      .from(productTags)
      .where(and(eq(productTags.id, id), isNull(productTags.deletedAt)))
      .limit(1)
    return row ?? null
  }

  return {
    async list({ limit = 20, offset = 0, q }: ListTagsOptions = {}) {
      const where = q
        ? and(isNull(productTags.deletedAt), ilike(productTags.value, `%${q}%`))
        : isNull(productTags.deletedAt)
      return ctx.db
        .select()
        .from(productTags)
        .where(where)
        .orderBy(desc(productTags.createdAt), desc(productTags.id))
        .limit(limit)
        .offset(offset)
    },

    get,

    async create(input: CreateTagInput) {
      const data = createTagInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(productTags)
          .values({ id: pygId('ptag'), value: data.value, metadata: data.metadata ?? null })
          .returning()
        await emitDomainEvent(tx, 'product-tag.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateTagInput) {
      const data = updateTagInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(productTags)
          .set({
            ...(data.value !== undefined ? { value: data.value } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(productTags.id, id), isNull(productTags.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'product-tag.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(productTags)
          .set({ deletedAt: new Date() })
          .where(and(eq(productTags.id, id), isNull(productTags.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'product-tag.deleted', { id: row.id })
        return row
      })
    },

    async listProductIds(tagId: string) {
      const rows = await ctx.db
        .select({ productId: productTagProduct.productId })
        .from(productTagProduct)
        .where(eq(productTagProduct.tagId, tagId))
      return rows.map((r) => r.productId)
    },

    /** Attach/detach products. Idempotent adds. */
    async setProducts(tagId: string, { add = [], remove = [] }: { add?: string[]; remove?: string[] }) {
      return ctx.db.transaction(async (tx) => {
        if (add.length) {
          await tx
            .insert(productTagProduct)
            .values(add.map((productId) => ({ tagId, productId })))
            .onConflictDoNothing()
        }
        if (remove.length) {
          await tx
            .delete(productTagProduct)
            .where(and(eq(productTagProduct.tagId, tagId), inArray(productTagProduct.productId, remove)))
        }
        await emitDomainEvent(tx, 'product-tag.products-updated', { id: tagId, added: add.length, removed: remove.length })
        const rows = await tx
          .select({ productId: productTagProduct.productId })
          .from(productTagProduct)
          .where(eq(productTagProduct.tagId, tagId))
        return rows.map((r) => r.productId)
      })
    },

    /** Published products carrying the tag — storefront. */
    async storefrontProducts(tagId: string, { limit = 20, offset = 0 }: ListStorefrontProductsOptions = {}) {
      return ctx.db
        .select(getTableColumns(products))
        .from(productTagProduct)
        .innerJoin(products, eq(productTagProduct.productId, products.id))
        .where(and(eq(productTagProduct.tagId, tagId), isNull(products.deletedAt), eq(products.status, 'published')))
        .orderBy(desc(products.createdAt), desc(products.id))
        .limit(limit)
        .offset(offset)
    },
  }
}

export type TagsService = ReturnType<typeof createTagsService>
