import { and, desc, eq, getTableColumns, ilike, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { products } from '../schema/products'
import { productCollectionProduct, productCollections } from '../schema/taxonomy'
import {
  collectionProductsInput,
  createCollectionInput,
  updateCollectionInput,
  type CollectionProductsInput,
  type CreateCollectionInput,
  type UpdateCollectionInput,
} from '../validation/taxonomy'
import type { ServiceContext } from './context'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface ListCollectionsOptions {
  limit?: number
  offset?: number
  q?: string
}

export interface ListStorefrontProductsOptions {
  limit?: number
  offset?: number
}

export function createCollectionsService(ctx: ServiceContext) {
  async function get(id: string) {
    const [row] = await ctx.db
      .select()
      .from(productCollections)
      .where(and(eq(productCollections.id, id), isNull(productCollections.deletedAt)))
      .limit(1)
    return row ?? null
  }

  return {
    async list({ limit = 20, offset = 0, q }: ListCollectionsOptions = {}) {
      const where = q
        ? and(isNull(productCollections.deletedAt), ilike(productCollections.title, `%${q}%`))
        : isNull(productCollections.deletedAt)
      return ctx.db
        .select()
        .from(productCollections)
        .where(where)
        .orderBy(desc(productCollections.createdAt), desc(productCollections.id))
        .limit(limit)
        .offset(offset)
    },

    get,

    async create(input: CreateCollectionInput) {
      const data = createCollectionInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(productCollections)
          .values({
            id: pygId('pcol'),
            title: data.title,
            handle: data.handle ?? slugify(data.title),
            metadata: data.metadata ?? null,
          })
          .returning()
        await emitDomainEvent(tx, 'product-collection.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateCollectionInput) {
      const data = updateCollectionInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(productCollections)
          .set({
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.handle !== undefined ? { handle: data.handle } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(productCollections.id, id), isNull(productCollections.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'product-collection.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(productCollections)
          .set({ deletedAt: new Date() })
          .where(and(eq(productCollections.id, id), isNull(productCollections.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'product-collection.deleted', { id: row.id })
        return row
      })
    },

    async listProductIds(collectionId: string) {
      const rows = await ctx.db
        .select({ productId: productCollectionProduct.productId })
        .from(productCollectionProduct)
        .where(eq(productCollectionProduct.collectionId, collectionId))
      return rows.map((r) => r.productId)
    },

    /**
     * Batch add/remove (Medusa v2 parity: single endpoint). "add"
     * reassigns each product's collection — a product belongs to at most one
     * collection at a time (belongsTo semantics, `productId` is the join
     * table's PK), so adding it here silently detaches it from any other.
     */
    async updateProducts(collectionId: string, input: CollectionProductsInput) {
      const data = collectionProductsInput.parse(input)
      const add = data.add ?? []
      const remove = data.remove ?? []
      await ctx.db.transaction(async (tx) => {
        if (add.length > 0) {
          await tx
            .insert(productCollectionProduct)
            .values(add.map((productId) => ({ productId, collectionId })))
            .onConflictDoUpdate({ target: productCollectionProduct.productId, set: { collectionId } })
        }
        if (remove.length > 0) {
          await tx
            .delete(productCollectionProduct)
            .where(
              and(
                eq(productCollectionProduct.collectionId, collectionId),
                inArray(productCollectionProduct.productId, remove),
              ),
            )
        }
        await emitDomainEvent(tx, 'product-collection.products-updated', { id: collectionId, add, remove })
      })
    },

    /** Published products in the collection (storefront). */
    async storefrontProducts(collectionId: string, { limit = 20, offset = 0 }: ListStorefrontProductsOptions = {}) {
      return ctx.db
        .select(getTableColumns(products))
        .from(productCollectionProduct)
        .innerJoin(products, eq(productCollectionProduct.productId, products.id))
        .where(
          and(
            eq(productCollectionProduct.collectionId, collectionId),
            isNull(products.deletedAt),
            eq(products.status, 'published'),
          ),
        )
        .orderBy(desc(products.createdAt), desc(products.id))
        .limit(limit)
        .offset(offset)
    },
  }
}

export type CollectionsService = ReturnType<typeof createCollectionsService>
