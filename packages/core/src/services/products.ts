import { and, asc, desc, eq, getTableColumns, ilike, inArray, isNull, or } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import type { PygmalionDatabase } from '../db/types'
import {
  productImages,
  productOptions,
  productOptionValues,
  productVariantImages,
  productVariantOptions,
  productVariants,
  products,
  type ProductOptionValue,
} from '../schema/products'
import { productSalesChannel } from '../schema/sales-channels'
import { productCategoryProduct, productCollectionProduct, productTagProduct } from '../schema/taxonomy'
import {
  addImagesInput,
  batchProductsInput,
  batchVariantsInput,
  createOptionInput,
  createProductInput,
  createVariantInput,
  updateOptionInput,
  updateProductInput,
  updateVariantInput,
  variantImagesInput,
  type AddImagesInput,
  type BatchProductsInput,
  type BatchVariantsInput,
  type CreateOptionInput,
  type CreateProductInput,
  type CreateVariantInput,
  type UpdateOptionInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  type VariantImagesInput,
} from '../validation/products'
import type { ServiceContext } from './context'

export type ProductStatusValue = 'draft' | 'proposed' | 'published' | 'rejected'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// --- variant <-> option value combination rules -----------------------------

async function fetchVariantOptionValueIds(db: PygmalionDatabase, variantIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (!variantIds.length) return map
  const links = await db
    .select({ variantId: productVariantOptions.variantId, optionValueId: productVariantOptions.optionValueId })
    .from(productVariantOptions)
    .where(inArray(productVariantOptions.variantId, variantIds))
  for (const l of links) {
    const arr = map.get(l.variantId) ?? []
    arr.push(l.optionValueId)
    map.set(l.variantId, arr)
  }
  return map
}

/** Exactly one option_value_id per live product option, no partial combinations. */
async function assertOptionCoverage(db: PygmalionDatabase, productId: string, optionValueIds: string[]): Promise<void> {
  const options = await db.select({ id: productOptions.id }).from(productOptions).where(eq(productOptions.productId, productId))
  if (options.length === 0) {
    if (optionValueIds.length > 0) {
      throw new Error('products: this product has no options — a variant must not supply option values')
    }
    return
  }
  if (optionValueIds.length !== options.length) {
    throw new Error(
      `products: a variant must supply exactly one value per product option (expected ${options.length}, got ${optionValueIds.length})`,
    )
  }
  const values = optionValueIds.length
    ? await db
        .select({ id: productOptionValues.id, optionId: productOptionValues.optionId })
        .from(productOptionValues)
        .where(inArray(productOptionValues.id, optionValueIds))
    : []
  if (values.length !== optionValueIds.length) {
    throw new Error('products: unknown option value id')
  }
  const optionIds = new Set(options.map((o) => o.id))
  const covered = new Set<string>()
  for (const v of values) {
    if (!optionIds.has(v.optionId)) {
      throw new Error('products: option value does not belong to this product')
    }
    if (covered.has(v.optionId)) {
      throw new Error('products: a variant cannot have two values for the same option')
    }
    covered.add(v.optionId)
  }
}

/** No two live variants of a product may share the exact same option-value combination. */
async function assertUniqueCombination(
  db: PygmalionDatabase,
  productId: string,
  optionValueIds: string[],
  excludeVariantId: string | null,
): Promise<void> {
  const variants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
  const candidates = variants.filter((v) => v.id !== excludeVariantId)
  if (candidates.length === 0) return
  const byVariant = await fetchVariantOptionValueIds(
    db,
    candidates.map((c) => c.id),
  )
  const sortedNew = [...optionValueIds].sort()
  const sameSet = (a: string[]) => {
    const sorted = [...a].sort()
    return sorted.length === sortedNew.length && sorted.every((v, i) => v === sortedNew[i])
  }
  for (const c of candidates) {
    if (sameSet(byVariant.get(c.id) ?? [])) {
      throw new Error('products: a variant with this exact option combination already exists')
    }
  }
}

async function validateVariantOptions(
  db: PygmalionDatabase,
  productId: string,
  optionValueIds: string[],
  excludeVariantId: string | null,
): Promise<void> {
  await assertOptionCoverage(db, productId, optionValueIds)
  await assertUniqueCombination(db, productId, optionValueIds, excludeVariantId)
}

export interface ListProductsOptions {
  limit?: number
  offset?: number
  q?: string
  status?: ProductStatusValue | ProductStatusValue[]
  handle?: string
  /** Sales-channel scoping, see `store-products.get.ts`. */
  channelIds?: string[]
  // --- Taxonomy filters -------------------------------------------------------
  // Each is an `inArray` join against the relevant `product_*_product` pivot
  // table, same shape as the `channelIds` join above. Store-side mpath
  // descendant expansion for `categoryIds` happens at the route (categories
  // service), not here — this stays a plain id match.
  collectionIds?: string[]
  categoryIds?: string[]
  tagIds?: string[]
}

export interface GetProductOptions {
  status?: ProductStatusValue
}

export function createProductsService(ctx: ServiceContext) {
  async function get(id: string, opts: GetProductOptions = {}) {
    const conditions = [eq(products.id, id), isNull(products.deletedAt)]
    if (opts.status) conditions.push(eq(products.status, opts.status))
    const [row] = await ctx.db
      .select()
      .from(products)
      .where(and(...conditions))
      .limit(1)
    return row ?? null
  }

  async function create(input: CreateProductInput) {
    const data = createProductInput.parse(input)
    const isGiftcard = data.isGiftcard ?? false
    // is_giftcard=true forces discountable=false, unconditionally.
    const discountable = isGiftcard ? false : (data.discountable ?? true)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({
          id: pygId('prod'),
          title: data.title,
          subtitle: data.subtitle ?? null,
          description: data.description ?? null,
          handle: data.handle ?? slugify(data.title),
          status: data.status ?? 'draft',
          thumbnail: data.thumbnail ?? null,
          weight: data.weight ?? null,
          length: data.length ?? null,
          height: data.height ?? null,
          width: data.width ?? null,
          originCountry: data.originCountry ?? null,
          hsCode: data.hsCode ?? null,
          midCode: data.midCode ?? null,
          material: data.material ?? null,
          isGiftcard,
          discountable,
          externalId: data.externalId ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()
      await emitDomainEvent(tx, 'product.created', { id: row.id })
      return row
    })
  }

  async function update(id: string, input: UpdateProductInput) {
    const data = updateProductInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), isNull(products.deletedAt)))
        .limit(1)
      if (!current) return null
      const isGiftcard = data.isGiftcard ?? current.isGiftcard
      // Forced false whenever the resulting record is a giftcard, overriding
      // any explicit `discountable` also present in this same update.
      const discountable = isGiftcard ? false : (data.discountable ?? current.discountable)
      const [row] = await tx
        .update(products)
        .set({
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.handle !== undefined ? { handle: data.handle } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.thumbnail !== undefined ? { thumbnail: data.thumbnail } : {}),
          ...(data.weight !== undefined ? { weight: data.weight } : {}),
          ...(data.length !== undefined ? { length: data.length } : {}),
          ...(data.height !== undefined ? { height: data.height } : {}),
          ...(data.width !== undefined ? { width: data.width } : {}),
          ...(data.originCountry !== undefined ? { originCountry: data.originCountry } : {}),
          ...(data.hsCode !== undefined ? { hsCode: data.hsCode } : {}),
          ...(data.midCode !== undefined ? { midCode: data.midCode } : {}),
          ...(data.material !== undefined ? { material: data.material } : {}),
          isGiftcard,
          discountable,
          ...(data.externalId !== undefined ? { externalId: data.externalId } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning()
      await emitDomainEvent(tx, 'product.updated', { id: row.id })
      return row
    })
  }

  async function remove(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(products)
        .set({ deletedAt: new Date() })
        .where(and(eq(products.id, id), isNull(products.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'product.deleted', { id: row.id })
      return row
    })
  }

  async function batch(input: BatchProductsInput) {
    const data = batchProductsInput.parse(input)
    const created = []
    for (const c of data.create ?? []) created.push(await create(c))
    const updated = []
    for (const u of data.update ?? []) {
      const { id, ...rest } = u
      const row = await update(id, rest)
      if (row) updated.push(row)
    }
    const deleted: string[] = []
    for (const id of data.delete ?? []) {
      const row = await remove(id)
      if (row) deleted.push(row.id)
    }
    return { created, updated, deleted }
  }

  // --- variants ---------------------------------------------------------------

  async function listVariants(productId: string) {
    const rows = await ctx.db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
      .orderBy(asc(productVariants.variantRank), asc(productVariants.createdAt))
    const map = await fetchVariantOptionValueIds(
      ctx.db,
      rows.map((r) => r.id),
    )
    return rows.map((r) => ({ ...r, optionValueIds: map.get(r.id) ?? [] }))
  }

  /**
   * Variants of SEVERAL products in one query (storefront listing): a grid
   * of 20 products needs 20 price tags, and `listVariants` per product is 20
   * round-trips. Ordered like `listVariants` so the first variant of a product
   * stays the same row in both reads.
   */
  async function listVariantsForProducts(productIds: string[]) {
    if (!productIds.length) return new Map<string, (typeof productVariants.$inferSelect)[]>()
    const rows = await ctx.db
      .select()
      .from(productVariants)
      .where(and(inArray(productVariants.productId, productIds), isNull(productVariants.deletedAt)))
      .orderBy(asc(productVariants.variantRank), asc(productVariants.createdAt))
    const map = new Map<string, (typeof productVariants.$inferSelect)[]>(productIds.map((id) => [id, []]))
    for (const row of rows) map.get(row.productId)?.push(row)
    return map
  }

  async function getVariant(productId: string, variantId: string) {
    const [row] = await ctx.db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
      .limit(1)
    if (!row) return null
    const map = await fetchVariantOptionValueIds(ctx.db, [row.id])
    return { ...row, optionValueIds: map.get(row.id) ?? [] }
  }

  async function createVariant(productId: string, input: CreateVariantInput) {
    const data = createVariantInput.parse(input)
    const optionValueIds = data.optionValueIds ?? []
    return ctx.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1)
      if (!product) throw new Error('products: product not found')
      await validateVariantOptions(tx, productId, optionValueIds, null)
      const [row] = await tx
        .insert(productVariants)
        .values({
          id: pygId('variant'),
          productId,
          title: data.title,
          sku: data.sku ?? null,
          barcode: data.barcode ?? null,
          ean: data.ean ?? null,
          upc: data.upc ?? null,
          allowBackorder: data.allowBackorder ?? false,
          manageInventory: data.manageInventory ?? true,
          hsCode: data.hsCode ?? null,
          midCode: data.midCode ?? null,
          originCountry: data.originCountry ?? null,
          material: data.material ?? null,
          weight: data.weight ?? null,
          length: data.length ?? null,
          height: data.height ?? null,
          width: data.width ?? null,
          metadata: data.metadata ?? null,
          variantRank: data.variantRank ?? 0,
          thumbnail: data.thumbnail ?? null,
        })
        .returning()
      if (optionValueIds.length) {
        await tx.insert(productVariantOptions).values(optionValueIds.map((optionValueId) => ({ variantId: row.id, optionValueId })))
      }
      await emitDomainEvent(tx, 'product-variant.created', { id: row.id })
      return { ...row, optionValueIds }
    })
  }

  async function updateVariant(productId: string, variantId: string, input: UpdateVariantInput) {
    const data = updateVariantInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
        .limit(1)
      if (!current) return null
      if (data.optionValueIds !== undefined) {
        await validateVariantOptions(tx, productId, data.optionValueIds, variantId)
      }
      const [row] = await tx
        .update(productVariants)
        .set({
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.sku !== undefined ? { sku: data.sku } : {}),
          ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
          ...(data.ean !== undefined ? { ean: data.ean } : {}),
          ...(data.upc !== undefined ? { upc: data.upc } : {}),
          ...(data.allowBackorder !== undefined ? { allowBackorder: data.allowBackorder } : {}),
          ...(data.manageInventory !== undefined ? { manageInventory: data.manageInventory } : {}),
          ...(data.hsCode !== undefined ? { hsCode: data.hsCode } : {}),
          ...(data.midCode !== undefined ? { midCode: data.midCode } : {}),
          ...(data.originCountry !== undefined ? { originCountry: data.originCountry } : {}),
          ...(data.material !== undefined ? { material: data.material } : {}),
          ...(data.weight !== undefined ? { weight: data.weight } : {}),
          ...(data.length !== undefined ? { length: data.length } : {}),
          ...(data.height !== undefined ? { height: data.height } : {}),
          ...(data.width !== undefined ? { width: data.width } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          ...(data.variantRank !== undefined ? { variantRank: data.variantRank } : {}),
          ...(data.thumbnail !== undefined ? { thumbnail: data.thumbnail } : {}),
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, variantId))
        .returning()
      let optionValueIds = (await fetchVariantOptionValueIds(tx, [variantId])).get(variantId) ?? []
      if (data.optionValueIds !== undefined) {
        await tx.delete(productVariantOptions).where(eq(productVariantOptions.variantId, variantId))
        if (data.optionValueIds.length) {
          await tx
            .insert(productVariantOptions)
            .values(data.optionValueIds.map((optionValueId) => ({ variantId, optionValueId })))
        }
        optionValueIds = data.optionValueIds
      }
      await emitDomainEvent(tx, 'product-variant.updated', { id: row.id })
      return { ...row, optionValueIds }
    })
  }

  async function removeVariant(productId: string, variantId: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(productVariants)
        .set({ deletedAt: new Date() })
        .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'product-variant.deleted', { id: row.id })
      return row
    })
  }

  async function batchVariants(productId: string, input: BatchVariantsInput) {
    const data = batchVariantsInput.parse(input)
    const created = []
    for (const c of data.create ?? []) created.push(await createVariant(productId, c))
    const updated = []
    for (const u of data.update ?? []) {
      const { id, ...rest } = u
      const row = await updateVariant(productId, id, rest)
      if (row) updated.push(row)
    }
    const deleted: string[] = []
    for (const id of data.delete ?? []) {
      const row = await removeVariant(productId, id)
      if (row) deleted.push(row.id)
    }
    return { created, updated, deleted }
  }

  async function setVariantImages(productId: string, variantId: string, input: VariantImagesInput) {
    const data = variantImagesInput.parse(input)
    const add = data.add ?? []
    const remove = data.remove ?? []
    return ctx.db.transaction(async (tx) => {
      const [variant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
        .limit(1)
      if (!variant) throw new Error('products: variant not found')
      if (remove.length) {
        await tx
          .delete(productVariantImages)
          .where(and(eq(productVariantImages.variantId, variantId), inArray(productVariantImages.imageId, remove)))
      }
      if (add.length) {
        await tx
          .insert(productVariantImages)
          .values(add.map((imageId) => ({ variantId, imageId })))
          .onConflictDoNothing()
      }
      await emitDomainEvent(tx, 'product-variant.updated', { id: variantId, imagesAdded: add, imagesRemoved: remove })
      const rows = await tx.select({ imageId: productVariantImages.imageId }).from(productVariantImages).where(eq(productVariantImages.variantId, variantId))
      return rows.map((r) => r.imageId)
    })
  }

  // --- options ------------------------------------------------------------------

  async function listOptions(productId: string) {
    const options = await ctx.db
      .select()
      .from(productOptions)
      .where(eq(productOptions.productId, productId))
      .orderBy(asc(productOptions.createdAt))
    if (!options.length) return []
    const values = await ctx.db
      .select()
      .from(productOptionValues)
      .where(inArray(productOptionValues.optionId, options.map((o) => o.id)))
      .orderBy(asc(productOptionValues.rank))
    return options.map((o) => ({ ...o, values: values.filter((v) => v.optionId === o.id) }))
  }

  async function createOption(productId: string, input: CreateOptionInput) {
    const data = createOptionInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1)
      if (!product) throw new Error('products: product not found')
      const [option] = await tx
        .insert(productOptions)
        .values({ id: pygId('opt'), productId, title: data.title, metadata: data.metadata ?? null })
        .returning()
      const valuesInput = data.values ?? []
      let values: ProductOptionValue[] = []
      if (valuesInput.length) {
        values = await tx
          .insert(productOptionValues)
          .values(valuesInput.map((v, i) => ({ id: pygId('optval'), optionId: option.id, value: v.value, rank: v.rank ?? i })))
          .returning()
      }
      await emitDomainEvent(tx, 'product-option.created', { id: option.id })
      return { ...option, values }
    })
  }

  async function updateOption(productId: string, optionId: string, input: UpdateOptionInput) {
    const data = updateOptionInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [option] = await tx
        .select()
        .from(productOptions)
        .where(and(eq(productOptions.id, optionId), eq(productOptions.productId, productId)))
        .limit(1)
      if (!option) return null
      const [row] = await tx
        .update(productOptions)
        .set({
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(eq(productOptions.id, optionId))
        .returning()
      let values = await tx
        .select()
        .from(productOptionValues)
        .where(eq(productOptionValues.optionId, optionId))
        .orderBy(asc(productOptionValues.rank))
      if (data.values !== undefined) {
        const keep = new Set(data.values.map((v) => v.value))
        const removed = values.filter((v) => !keep.has(v.value))
        if (removed.length) {
          const removedIds = removed.map((v) => v.id)
          // Refuse to drop a value still referenced by a live variant.
          const used = await tx
            .select({ optionValueId: productVariantOptions.optionValueId })
            .from(productVariantOptions)
            .innerJoin(productVariants, eq(productVariantOptions.variantId, productVariants.id))
            .where(and(inArray(productVariantOptions.optionValueId, removedIds), isNull(productVariants.deletedAt)))
            .limit(1)
          if (used.length) {
            throw new Error('products: cannot remove an option value still used by a variant')
          }
          await tx.delete(productOptionValues).where(inArray(productOptionValues.id, removedIds))
        }
        for (const [i, v] of data.values.entries()) {
          const match = values.find((e) => e.value === v.value)
          if (match) {
            await tx.update(productOptionValues).set({ rank: v.rank ?? i, updatedAt: new Date() }).where(eq(productOptionValues.id, match.id))
          } else {
            await tx.insert(productOptionValues).values({ id: pygId('optval'), optionId, value: v.value, rank: v.rank ?? i })
          }
        }
        values = await tx
          .select()
          .from(productOptionValues)
          .where(eq(productOptionValues.optionId, optionId))
          .orderBy(asc(productOptionValues.rank))
      }
      await emitDomainEvent(tx, 'product-option.updated', { id: optionId })
      return { ...row, values }
    })
  }

  async function removeOption(productId: string, optionId: string) {
    return ctx.db.transaction(async (tx) => {
      const [option] = await tx
        .select()
        .from(productOptions)
        .where(and(eq(productOptions.id, optionId), eq(productOptions.productId, productId)))
        .limit(1)
      if (!option) return null
      const valueIds = (
        await tx.select({ id: productOptionValues.id }).from(productOptionValues).where(eq(productOptionValues.optionId, optionId))
      ).map((v) => v.id)
      if (valueIds.length) {
        const used = await tx
          .select({ optionValueId: productVariantOptions.optionValueId })
          .from(productVariantOptions)
          .innerJoin(productVariants, eq(productVariantOptions.variantId, productVariants.id))
          .where(and(inArray(productVariantOptions.optionValueId, valueIds), isNull(productVariants.deletedAt)))
          .limit(1)
        if (used.length) {
          throw new Error('products: cannot remove an option still used by a variant')
        }
      }
      await tx.delete(productOptions).where(eq(productOptions.id, optionId))
      await emitDomainEvent(tx, 'product-option.deleted', { id: optionId })
      return option
    })
  }

  // --- images ---------------------------------------------------------------

  async function addImages(productId: string, input: AddImagesInput) {
    const data = addImagesInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1)
      if (!product) throw new Error('products: product not found')
      const existingCount = (await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId)))
        .length
      const rows = await tx
        .insert(productImages)
        .values(
          data.images.map((img, i) => ({
            id: pygId('img'),
            productId,
            url: img.url,
            // Auto rank = insertion index, continuing after
            // whatever images already exist.
            rank: img.rank ?? existingCount + i,
            metadata: img.metadata ?? null,
          })),
        )
        .returning()
      // Auto thumbnail: first image's url when unset.
      if (!product.thumbnail && rows.length) {
        await tx.update(products).set({ thumbnail: rows[0].url, updatedAt: new Date() }).where(eq(products.id, productId))
      }
      await emitDomainEvent(tx, 'product.updated', { id: productId, imagesAdded: rows.map((r) => r.id) })
      return rows
    })
  }

  async function removeImage(productId: string, imageId: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(productImages)
        .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'product.updated', { id: productId, imagesRemoved: [imageId] })
      return row
    })
  }

  return {
    async list({
      limit = 20,
      offset = 0,
      q,
      status,
      handle,
      channelIds,
      collectionIds,
      categoryIds,
      tagIds,
    }: ListProductsOptions = {}) {
      const conditions = [isNull(products.deletedAt)]
      if (q) {
        conditions.push(
          or(ilike(products.title, `%${q}%`), ilike(products.subtitle, `%${q}%`), ilike(products.description, `%${q}%`))!,
        )
      }
      if (status) {
        conditions.push(Array.isArray(status) ? inArray(products.status, status) : eq(products.status, status))
      }
      if (handle) conditions.push(eq(products.handle, handle))
      if (channelIds) conditions.push(inArray(productSalesChannel.salesChannelId, channelIds))
      if (collectionIds) conditions.push(inArray(productCollectionProduct.collectionId, collectionIds))
      if (categoryIds) conditions.push(inArray(productCategoryProduct.categoryId, categoryIds))
      if (tagIds) conditions.push(inArray(productTagProduct.tagId, tagIds))
      const where = and(...conditions)

      if (!channelIds && !collectionIds && !categoryIds && !tagIds) {
        return ctx.db
          .select()
          .from(products)
          .where(where)
          // Stable total order: id breaks created_at ties so pagination never
          // skips or duplicates rows created in the same instant.
          .orderBy(desc(products.createdAt), desc(products.id))
          .limit(limit)
          .offset(offset)
      }

      // selectDistinct: joining any *_product pivot table can multiply a
      // product's row (several matching channels/categories/tags at once).
      let query = ctx.db.selectDistinct(getTableColumns(products)).from(products).$dynamic()
      if (channelIds) query = query.innerJoin(productSalesChannel, eq(products.id, productSalesChannel.productId))
      if (collectionIds) query = query.innerJoin(productCollectionProduct, eq(products.id, productCollectionProduct.productId))
      if (categoryIds) query = query.innerJoin(productCategoryProduct, eq(products.id, productCategoryProduct.productId))
      if (tagIds) query = query.innerJoin(productTagProduct, eq(products.id, productTagProduct.productId))
      return query
        .where(where)
        .orderBy(desc(products.createdAt), desc(products.id))
        .limit(limit)
        .offset(offset)
    },

    get,
    create,
    update,
    remove,
    batch,

    variants: {
      list: listVariants,
      listForProducts: listVariantsForProducts,
      get: getVariant,
      create: createVariant,
      update: updateVariant,
      remove: removeVariant,
      batch: batchVariants,
      setImages: setVariantImages,
    },

    options: {
      list: listOptions,
      create: createOption,
      update: updateOption,
      remove: removeOption,
    },

    images: {
      add: addImages,
      remove: removeImage,
      /** Ordered images of a product. */
      async list(productId: string) {
        return ctx.db
          .select()
          .from(productImages)
          .where(eq(productImages.productId, productId))
          .orderBy(asc(productImages.rank), asc(productImages.id))
      },
    },
  }
}

export type ProductsService = ReturnType<typeof createProductsService>
