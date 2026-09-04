// Tax input schemas.
import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

const ruleInput = z.object({
  reference: z.string().trim().min(1),
  referenceId: z.string().trim().min(1),
  metadata,
})

// --- TaxRegion -----------------------------------------------------------------

export const createTaxRegionInput = z.object({
  countryCode: z.string().trim().min(2),
  // Required for a child (province) region, forbidden on a top-level one —
  // service enforces the pairing (schema CHECK only pins the provider side).
  provinceCode: z.string().trim().min(1).nullable().optional(),
  // Only meaningful on a top-level region; defaults to the built-in `system`
  // provider (services/tax.ts) when omitted there.
  providerId: z.string().trim().min(1).nullable().optional(),
  parentId: z.string().optional(),
  metadata,
  createdBy: z.string().optional(),
})
export type CreateTaxRegionInput = z.input<typeof createTaxRegionInput>

export const updateTaxRegionInput = z.object({
  countryCode: z.string().trim().min(2).optional(),
  provinceCode: z.string().trim().min(1).nullable().optional(),
  providerId: z.string().trim().min(1).nullable().optional(),
  metadata,
})
export type UpdateTaxRegionInput = z.input<typeof updateTaxRegionInput>

// --- TaxRate ---------------------------------------------------------------

export const createTaxRateInput = z.object({
  taxRegionId: z.string().trim().min(1),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  rate: z.number().nullable().optional(),
  isDefault: z.boolean().optional(),
  isCombinable: z.boolean().optional(),
  rules: z.array(ruleInput).optional(),
  metadata,
  createdBy: z.string().optional(),
})
export type CreateTaxRateInput = z.input<typeof createTaxRateInput>

export const updateTaxRateInput = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  rate: z.number().nullable().optional(),
  isDefault: z.boolean().optional(),
  isCombinable: z.boolean().optional(),
  // Present (even `[]`) => replace-set: soft-delete existing rules, recreate
  // from this array. Omitted => rules untouched.
  rules: z.array(ruleInput).optional(),
  metadata,
})
export type UpdateTaxRateInput = z.input<typeof updateTaxRateInput>

// --- TaxRateRule -----------------------------------------------------------

export const createTaxRateRuleInput = ruleInput.extend({ createdBy: z.string().optional() })
export type CreateTaxRateRuleInput = z.input<typeof createTaxRateRuleInput>
