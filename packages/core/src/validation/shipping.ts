// Shipping config.
import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

// --- FulfillmentSet --------------------------------------------------------------

export const createFulfillmentSetInput = z.object({
  name: z.string().trim().min(1),
  metadata,
})
export type CreateFulfillmentSetInput = z.input<typeof createFulfillmentSetInput>

export const updateFulfillmentSetInput = z.object({
  name: z.string().trim().min(1).optional(),
  metadata,
})
export type UpdateFulfillmentSetInput = z.input<typeof updateFulfillmentSetInput>

// --- ServiceZone (+ inline GeoZones, replace-set like tax_rate rules) ------------

const geoZoneInput = z.object({
  type: z.enum(['country', 'province', 'city', 'zip']),
  countryCode: z.string().trim().toLowerCase().length(2),
  provinceCode: z.string().trim().toLowerCase().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  postalExpression: z
    .object({ codes: z.array(z.string().trim()).optional(), prefix: z.string().trim().optional() })
    .nullable()
    .optional(),
})
export type GeoZoneInput = z.input<typeof geoZoneInput>

export const createServiceZoneInput = z.object({
  name: z.string().trim().min(1),
  geoZones: z.array(geoZoneInput).optional(),
  metadata,
})
export type CreateServiceZoneInput = z.input<typeof createServiceZoneInput>

export const updateServiceZoneInput = z.object({
  name: z.string().trim().min(1).optional(),
  // Present (even `[]`) => replace every geo zone under this service zone.
  geoZones: z.array(geoZoneInput).optional(),
  metadata,
})
export type UpdateServiceZoneInput = z.input<typeof updateServiceZoneInput>

// --- ShippingProfile ---------------------------------------------------------------

export const createShippingProfileInput = z.object({
  name: z.string().trim().min(1),
  isDefault: z.boolean().optional(),
  metadata,
})
export type CreateShippingProfileInput = z.input<typeof createShippingProfileInput>

export const updateShippingProfileInput = z.object({
  name: z.string().trim().min(1).optional(),
  isDefault: z.boolean().optional(),
  metadata,
})
export type UpdateShippingProfileInput = z.input<typeof updateShippingProfileInput>

// --- ShippingOption (+ rules) --------------------------------------------------

const shippingOptionRuleInput = z.object({
  attribute: z.string().trim().min(1),
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in']).optional(),
  value: z.union([z.number(), z.array(z.number())]),
})
export type ShippingOptionRuleInput = z.input<typeof shippingOptionRuleInput>

export const createShippingOptionInput = z.object({
  name: z.string().trim().min(1),
  serviceZoneId: z.string().trim().min(1),
  shippingProfileId: z.string().trim().min(1),
  providerId: z.string().trim().min(1).optional(),
  priceType: z.enum(['flat', 'calculated']).optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  rules: z.array(shippingOptionRuleInput).optional(),
  metadata,
})
export type CreateShippingOptionInput = z.input<typeof createShippingOptionInput>

export const updateShippingOptionInput = z.object({
  name: z.string().trim().min(1).optional(),
  serviceZoneId: z.string().trim().min(1).optional(),
  shippingProfileId: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  priceType: z.enum(['flat', 'calculated']).optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  // Present (even `[]`) => replace-set (same convention as tax rules).
  rules: z.array(shippingOptionRuleInput).optional(),
  metadata,
})
export type UpdateShippingOptionInput = z.input<typeof updateShippingOptionInput>

export const replaceShippingOptionRulesInput = z.object({
  rules: z.array(shippingOptionRuleInput),
})
export type ReplaceShippingOptionRulesInput = z.input<typeof replaceShippingOptionRulesInput>

// --- Product <-> ShippingProfile link --------------------------------------------
// Same `{ add, remove }` batch shape as `collectionProductsInput`
// (validation/taxonomy.ts) — one profile per product max, `add` reassigns.

export const shippingProfileProductsInput = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})
export type ShippingProfileProductsInput = z.input<typeof shippingProfileProductsInput>
