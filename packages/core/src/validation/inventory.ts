import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()
const nullableText = z.string().trim().min(1).nullable().optional()
const nullableInt = z.number().int().nullable().optional()

// --- StockLocation (+ inline address) ----------------------------------------

const addressShape = {
  address1: z.string().trim().min(1),
  address2: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  countryCode: z.string().trim().min(2),
  province: z.string().trim().nullable().optional(),
  postalCode: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  company: z.string().trim().nullable().optional(),
}

export const stockLocationAddressInput = z.object(addressShape)
export type StockLocationAddressInput = z.input<typeof stockLocationAddressInput>

export const createStockLocationInput = z.object({
  name: z.string().trim().min(1),
  address: stockLocationAddressInput.nullable().optional(),
  metadata,
})
export type CreateStockLocationInput = z.input<typeof createStockLocationInput>

export const updateStockLocationInput = z.object({
  name: z.string().trim().min(1).optional(),
  address: stockLocationAddressInput.nullable().optional(),
  metadata,
})
export type UpdateStockLocationInput = z.input<typeof updateStockLocationInput>

// --- InventoryItem ------------------------------------------------------------

const inventoryItemShape = {
  sku: nullableText,
  weight: nullableInt,
  length: nullableInt,
  height: nullableInt,
  width: nullableInt,
  originCountry: nullableText,
  hsCode: nullableText,
  midCode: nullableText,
  requiresShipping: z.boolean().optional(),
  metadata,
}

export const createInventoryItemInput = z.object(inventoryItemShape)
export type CreateInventoryItemInput = z.input<typeof createInventoryItemInput>

export const updateInventoryItemInput = z.object(inventoryItemShape)
export type UpdateInventoryItemInput = z.input<typeof updateInventoryItemInput>

// --- InventoryLevel -------------------------------------------------------------

export const upsertInventoryLevelInput = z.object({
  stockedQuantity: z.number().int().min(0).optional(),
  incomingQuantity: z.number().int().min(0).optional(),
})
export type UpsertInventoryLevelInput = z.input<typeof upsertInventoryLevelInput>

// --- Variant <-> InventoryItem link (kits) --------------------------------------

export const linkVariantInventoryItemInput = z.object({
  inventoryItemId: z.string().trim().min(1),
  requiredQuantity: z.number().int().min(1).optional(),
})
export type LinkVariantInventoryItemInput = z.input<typeof linkVariantInventoryItemInput>

// --- Reservations ---------------------------------------------------------------
// Direct admin CRUD on a single inventory item (raw provider passthrough) —
// distinct from the kit-aware `reserveVariants` cart-facing entry point.

export const createReservationInput = z.object({
  inventoryItemId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  quantity: z.number().int().min(1),
  lineItemId: nullableText,
  allowBackorder: z.boolean().optional(),
  externalId: nullableText,
  description: nullableText,
  metadata,
})
export type CreateReservationInput = z.input<typeof createReservationInput>

export const updateReservationInput = z.object({
  quantity: z.number().int().min(1).optional(),
  description: nullableText,
  metadata,
})
export type UpdateReservationInput = z.input<typeof updateReservationInput>

// --- Cart-facing reservation (kit expansion, checkout) ---------------------------

export const reserveVariantsInput = z.object({
  locationId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        variantId: z.string().trim().min(1),
        quantity: z.number().int().min(1),
        lineItemId: nullableText,
      }),
    )
    .min(1),
})
export type ReserveVariantsInput = z.input<typeof reserveVariantsInput>
