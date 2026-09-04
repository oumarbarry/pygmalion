import { and, asc, desc, eq, getTableColumns, ilike, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { products } from '../schema/products'
import { productCategories, productCategoryProduct } from '../schema/taxonomy'
import {
  categoryProductsInput,
  createCategoryInput,
  updateCategoryInput,
  type CategoryProductsInput,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '../validation/taxonomy'
import type { ServiceContext } from './context'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface ListCategoriesOptions {
  limit?: number
  offset?: number
  q?: string
  /** `null` = top-level only, a string = children of that category, `undefined` = unfiltered. */
  parentCategoryId?: string | null
  isActive?: boolean
  isInternal?: boolean
  /** Store-facing visibility: is_active AND NOT is_internal. Overrides isActive/isInternal above. */
  storefront?: boolean
}

export interface ListStorefrontProductsOptions {
  limit?: number
  offset?: number
}

export function createCategoriesService(ctx: ServiceContext) {
  async function get(id: string) {
    const [row] = await ctx.db
      .select()
      .from(productCategories)
      .where(and(eq(productCategories.id, id), isNull(productCategories.deletedAt)))
      .limit(1)
    return row ?? null
  }

  /** Store-facing detail: 404s (returns null) unless visible (is_active AND NOT is_internal). */
  async function getStorefront(id: string) {
    const row = await get(id)
    if (!row || !row.isActive || row.isInternal) return null
    return row
  }

  // All live categories' id+mpath — used to resolve a subtree in application
  // code rather than a SQL `LIKE 'prefix%'` (nanoid ids can contain `_`, a LIKE
  // single-char wildcard, which would silently over-match a prefix search).
  async function liveMpaths(tx: ServiceContext['db']) {
    return tx
      .select({ id: productCategories.id, mpath: productCategories.mpath })
      .from(productCategories)
      .where(isNull(productCategories.deletedAt))
  }

  return {
    async list({
      limit = 20,
      offset = 0,
      q,
      parentCategoryId,
      isActive,
      isInternal,
      storefront,
    }: ListCategoriesOptions = {}) {
      const conditions = [isNull(productCategories.deletedAt)]
      if (q) conditions.push(ilike(productCategories.name, `%${q}%`))
      if (parentCategoryId !== undefined) {
        conditions.push(
          parentCategoryId === null
            ? isNull(productCategories.parentCategoryId)
            : eq(productCategories.parentCategoryId, parentCategoryId),
        )
      }
      if (storefront) {
        conditions.push(eq(productCategories.isActive, true), eq(productCategories.isInternal, false))
      } else {
        if (isActive !== undefined) conditions.push(eq(productCategories.isActive, isActive))
        if (isInternal !== undefined) conditions.push(eq(productCategories.isInternal, isInternal))
      }
      return ctx.db
        .select()
        .from(productCategories)
        .where(and(...conditions))
        .orderBy(asc(productCategories.rank), desc(productCategories.createdAt), desc(productCategories.id))
        .limit(limit)
        .offset(offset)
    },

    get,
    getStorefront,

    async create(input: CreateCategoryInput) {
      const data = createCategoryInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        let parentMpath: string | null = null
        if (data.parentCategoryId) {
          const [parent] = await tx
            .select({ mpath: productCategories.mpath })
            .from(productCategories)
            .where(and(eq(productCategories.id, data.parentCategoryId), isNull(productCategories.deletedAt)))
            .limit(1)
          if (!parent) throw new Error('categories: parent category not found')
          parentMpath = parent.mpath
        }
        // Id generated client-side (pygId), so mpath is computable in one shot —
        // no post-insert "fetch id then update mpath" round trip needed.
        const id = pygId('pcat')
        const mpath = parentMpath ? `${parentMpath}.${id}` : id
        const [row] = await tx
          .insert(productCategories)
          .values({
            id,
            name: data.name,
            description: data.description ?? '',
            handle: data.handle ?? slugify(data.name),
            mpath,
            isActive: data.isActive ?? false,
            isInternal: data.isInternal ?? false,
            rank: data.rank ?? 0,
            parentCategoryId: data.parentCategoryId ?? null,
            metadata: data.metadata ?? null,
          })
          .returning()
        await emitDomainEvent(tx, 'product-category.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateCategoryInput) {
      const data = updateCategoryInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(productCategories)
          .where(and(eq(productCategories.id, id), isNull(productCategories.deletedAt)))
          .limit(1)
        if (!current) return null

        let mpath = current.mpath
        // `!== undefined` distinguishes "reparent (incl. to null/top-level)"
        // from "field omitted, parent untouched" — both parse to `undefined`
        // otherwise (same ambiguity as `metadata` elsewhere in this codebase).
        const moving = data.parentCategoryId !== undefined && data.parentCategoryId !== current.parentCategoryId
        if (moving) {
          let newParentMpath: string | null = null
          if (data.parentCategoryId) {
            if (data.parentCategoryId === id) {
              throw new Error('categories: a category cannot be its own parent')
            }
            const [parent] = await tx
              .select({ mpath: productCategories.mpath })
              .from(productCategories)
              .where(and(eq(productCategories.id, data.parentCategoryId), isNull(productCategories.deletedAt)))
              .limit(1)
            if (!parent) throw new Error('categories: parent category not found')
            if (parent.mpath === current.mpath || parent.mpath.startsWith(`${current.mpath}.`)) {
              throw new Error('categories: cannot move a category under its own descendant')
            }
            newParentMpath = parent.mpath
          }
          const newMpath = newParentMpath ? `${newParentMpath}.${id}` : id

          // Recalculate every descendant's mpath (tested on 3 levels).
          const oldPrefix = `${current.mpath}.`
          const all = await liveMpaths(tx)
          const descendants = all.filter((row) => row.mpath.startsWith(oldPrefix))
          for (const d of descendants) {
            const rebased = newMpath + d.mpath.slice(current.mpath.length)
            await tx
              .update(productCategories)
              .set({ mpath: rebased, updatedAt: new Date() })
              .where(eq(productCategories.id, d.id))
          }
          mpath = newMpath
        }

        const [row] = await tx
          .update(productCategories)
          .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.handle !== undefined ? { handle: data.handle } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.isInternal !== undefined ? { isInternal: data.isInternal } : {}),
            ...(data.rank !== undefined ? { rank: data.rank } : {}),
            ...(moving ? { parentCategoryId: data.parentCategoryId ?? null, mpath } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(eq(productCategories.id, id))
          .returning()
        await emitDomainEvent(tx, 'product-category.updated', { id: row.id, moved: moving })
        return row
      })
    },

    /** Soft-delete a category AND its whole descendant subtree (cascade). */
    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(productCategories)
          .where(and(eq(productCategories.id, id), isNull(productCategories.deletedAt)))
          .limit(1)
        if (!current) return null

        const prefix = `${current.mpath}.`
        const all = await liveMpaths(tx)
        const descendantIds = all.filter((row) => row.mpath.startsWith(prefix)).map((row) => row.id)
        const ids = [current.id, ...descendantIds]
        await tx.update(productCategories).set({ deletedAt: new Date() }).where(inArray(productCategories.id, ids))
        await emitDomainEvent(tx, 'product-category.deleted', { id: current.id, cascaded: ids })
        return current
      })
    },

    /**
     * Given category ids, returns those ids plus every live descendant id
     * (mpath prefix match): storefront product-listing filter widening, so
     * a product filed under a sub-category also surfaces when a
     * parent category is filtered on.
     */
    async subtreeIds(categoryIds: string[]): Promise<string[]> {
      if (!categoryIds.length) return []
      const all = await liveMpaths(ctx.db)
      const prefixes = all.filter((row) => categoryIds.includes(row.id)).map((row) => `${row.mpath}.`)
      const descendantIds = all.filter((row) => prefixes.some((p) => row.mpath.startsWith(p))).map((row) => row.id)
      return [...new Set([...categoryIds, ...descendantIds])]
    },

    async listProductIds(categoryId: string) {
      const rows = await ctx.db
        .select({ productId: productCategoryProduct.productId })
        .from(productCategoryProduct)
        .where(eq(productCategoryProduct.categoryId, categoryId))
      return rows.map((r) => r.productId)
    },

    /** Batch add/remove (Medusa v2 parity): plain many-to-many. */
    async updateProducts(categoryId: string, input: CategoryProductsInput) {
      const data = categoryProductsInput.parse(input)
      const add = data.add ?? []
      const remove = data.remove ?? []
      await ctx.db.transaction(async (tx) => {
        if (add.length > 0) {
          await tx
            .insert(productCategoryProduct)
            .values(add.map((productId) => ({ productId, categoryId })))
            .onConflictDoNothing()
        }
        if (remove.length > 0) {
          await tx
            .delete(productCategoryProduct)
            .where(
              and(eq(productCategoryProduct.categoryId, categoryId), inArray(productCategoryProduct.productId, remove)),
            )
        }
        await emitDomainEvent(tx, 'product-category.products-updated', { id: categoryId, add, remove })
      })
    },

    /**
     * Published products in the category AND its descendants (mpath, same
     * expansion as the main listing's `subtreeIds`; a parent category like
     * « Maison » must show its children's products). Distinct products:
     * one may be linked to several categories of the subtree.
     */
    async storefrontProducts(categoryId: string, { limit = 20, offset = 0 }: ListStorefrontProductsOptions = {}) {
      const ids = await this.subtreeIds([categoryId])
      return ctx.db
        .selectDistinctOn([products.createdAt, products.id], getTableColumns(products))
        .from(productCategoryProduct)
        .innerJoin(products, eq(productCategoryProduct.productId, products.id))
        .where(
          and(
            inArray(productCategoryProduct.categoryId, ids),
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

export type CategoriesService = ReturnType<typeof createCategoriesService>
