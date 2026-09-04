import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()
const handle = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'handle must be a lowercase slug')

// Same `{add, remove}` shape used by the three product<->taxonomy batch links
// (mirrors `channelProductsInput`, Medusa parity).
const batchProducts = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})

// --- ProductCollection --------------------------------------------------------

export const createCollectionInput = z.object({
  title: z.string().trim().min(1),
  handle: handle.optional(),
  metadata,
})
export type CreateCollectionInput = z.input<typeof createCollectionInput>

export const updateCollectionInput = z.object({
  title: z.string().trim().min(1).optional(),
  handle: handle.optional(),
  metadata,
})
export type UpdateCollectionInput = z.input<typeof updateCollectionInput>

export const collectionProductsInput = batchProducts
export type CollectionProductsInput = z.input<typeof collectionProductsInput>

// --- ProductCategory -----------------------------------------------------------

export const createCategoryInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  handle: handle.optional(),
  // `null` = top-level (no parent); omitted = same (create default).
  parentCategoryId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  rank: z.number().int().optional(),
  metadata,
})
export type CreateCategoryInput = z.input<typeof createCategoryInput>

export const updateCategoryInput = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  handle: handle.optional(),
  // Present (incl. explicit `null`) => reparent/move, recomputing mpath for the
  // whole subtree; omitted => parent untouched. Distinguished via `!== undefined`.
  parentCategoryId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  rank: z.number().int().optional(),
  metadata,
})
export type UpdateCategoryInput = z.input<typeof updateCategoryInput>

export const categoryProductsInput = batchProducts
export type CategoryProductsInput = z.input<typeof categoryProductsInput>

// --- ProductTag ------------------------------------------------------------

export const createTagInput = z.object({
  value: z.string().trim().min(1),
  metadata,
})
export type CreateTagInput = z.input<typeof createTagInput>

export const updateTagInput = z.object({
  value: z.string().trim().min(1).optional(),
  metadata,
})
export type UpdateTagInput = z.input<typeof updateTagInput>
