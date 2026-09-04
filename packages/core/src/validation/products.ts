import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()
const nullableText = z.string().trim().min(1).nullable().optional()
const nullableNumber = z.number().nullable().optional()
const handle = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'handle must be a lowercase slug')

// --- Product ------------------------------------------------------------------

const productShape = {
  title: z.string().trim().min(1).optional(),
  subtitle: nullableText,
  description: nullableText,
  handle: handle.optional(),
  status: z.enum(['draft', 'proposed', 'published', 'rejected']).optional(),
  thumbnail: nullableText,
  weight: nullableNumber,
  length: nullableNumber,
  height: nullableNumber,
  width: nullableNumber,
  originCountry: nullableText,
  hsCode: nullableText,
  midCode: nullableText,
  material: nullableText,
  isGiftcard: z.boolean().optional(),
  discountable: z.boolean().optional(),
  externalId: nullableText,
  metadata,
}

export const createProductInput = z.object(productShape).required({ title: true })
export type CreateProductInput = z.input<typeof createProductInput>

export const updateProductInput = z.object(productShape)
export type UpdateProductInput = z.input<typeof updateProductInput>

export const batchProductsInput = z.object({
  create: z.array(createProductInput).optional(),
  update: z.array(updateProductInput.extend({ id: z.string() })).optional(),
  delete: z.array(z.string()).optional(),
})
export type BatchProductsInput = z.input<typeof batchProductsInput>

// --- ProductVariant -------------------------------------------------------------

const variantShape = {
  title: z.string().trim().min(1).optional(),
  sku: nullableText,
  barcode: nullableText,
  ean: nullableText,
  upc: nullableText,
  allowBackorder: z.boolean().optional(),
  manageInventory: z.boolean().optional(),
  hsCode: nullableText,
  midCode: nullableText,
  originCountry: nullableText,
  material: nullableText,
  weight: nullableNumber,
  length: nullableNumber,
  height: nullableNumber,
  width: nullableNumber,
  metadata,
  variantRank: z.number().int().nonnegative().optional(),
  thumbnail: nullableText,
  // Exactly one option_value_id per product option — validated
  // against the product's live options in the service, not here (needs DB).
  optionValueIds: z.array(z.string()).optional(),
}

export const createVariantInput = z.object(variantShape).required({ title: true })
export type CreateVariantInput = z.input<typeof createVariantInput>

export const updateVariantInput = z.object(variantShape)
export type UpdateVariantInput = z.input<typeof updateVariantInput>

export const batchVariantsInput = z.object({
  create: z.array(createVariantInput).optional(),
  update: z.array(updateVariantInput.extend({ id: z.string() })).optional(),
  delete: z.array(z.string()).optional(),
})
export type BatchVariantsInput = z.input<typeof batchVariantsInput>

export const variantImagesInput = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})
export type VariantImagesInput = z.input<typeof variantImagesInput>

// --- ProductOption / values -----------------------------------------------------

const optionValueShape = z.object({ value: z.string().trim().min(1), rank: z.number().int().optional() })

export const createOptionInput = z.object({
  title: z.string().trim().min(1),
  metadata,
  values: z.array(optionValueShape).optional(),
})
export type CreateOptionInput = z.input<typeof createOptionInput>

export const updateOptionInput = z.object({
  title: z.string().trim().min(1).optional(),
  metadata,
  // Wholesale replace when provided (service diffs against existing values;
  // refuses to drop a value still referenced by a live variant).
  values: z.array(optionValueShape).optional(),
})
export type UpdateOptionInput = z.input<typeof updateOptionInput>

// --- ProductImage ---------------------------------------------------------------

const imageShape = z.object({ url: z.string().trim().min(1), rank: z.number().int().nonnegative().optional(), metadata })

export const addImagesInput = z.object({
  images: z.array(imageShape).min(1),
})
export type AddImagesInput = z.input<typeof addImagesInput>
