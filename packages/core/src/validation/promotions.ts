// --- Promotions ------------------------------------------------------------
import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

export const promotionRuleOperator = z.enum(['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte'])

// `attribute` is free text (engine's closed set — see schema/promotions.ts
// header); validated shape only, not the value itself.
export const ruleInput = z.object({
  attribute: z.string().trim().min(1),
  operator: promotionRuleOperator.optional(),
  values: z.array(z.string().trim().min(1)).min(1),
})
export type RuleInput = z.input<typeof ruleInput>

const applicationMethodShape = {
  target: z.enum(['order', 'items', 'shipping']),
  allocation: z.enum(['each', 'across', 'once']).optional(),
  valueType: z.enum(['fixed', 'percentage']),
  value: z.number().int().nonnegative(),
  currencyCode: z.string().trim().toLowerCase().min(1).optional(),
  maxQuantity: z.number().int().positive().optional(),
  buyRulesMinQuantity: z.number().int().positive().optional(),
  applyToQuantity: z.number().int().positive().optional(),
  targetRules: z.array(ruleInput).optional(),
  buyRules: z.array(ruleInput).optional(),
}

export const createApplicationMethodInput = z
  .object(applicationMethodShape)
  .required({ target: true, valueType: true, value: true })
  .refine((v) => v.valueType !== 'fixed' || Boolean(v.currencyCode), {
    message: 'currencyCode is required when valueType is fixed',
    path: ['currencyCode'],
  })
  .refine((v) => v.valueType !== 'percentage' || v.value <= 100, {
    message: 'a percentage value cannot exceed 100',
    path: ['value'],
  })
export type CreateApplicationMethodInput = z.input<typeof createApplicationMethodInput>

// Partial patch — every field optional, no refine (nothing required, can't
// cross-validate fields that may not be present); each field stays
// independently valid on its own.
export const updateApplicationMethodInput = z.object(applicationMethodShape).partial()
export type UpdateApplicationMethodInput = z.input<typeof updateApplicationMethodInput>

// --- Promotion ----------------------------------------------------------------

export const createPromotionInput = z
  .object({
    code: z.string().trim().toUpperCase().min(1).optional(),
    isAutomatic: z.boolean().optional(),
    status: z.enum(['draft', 'active', 'inactive']).optional(),
    type: z.enum(['standard', 'buyget']).optional(),
    campaignId: z.string().trim().min(1).optional(),
    rules: z.array(ruleInput).optional(),
    applicationMethod: createApplicationMethodInput,
    metadata,
  })
  .refine((v) => v.isAutomatic || Boolean(v.code), {
    message: 'code is required unless isAutomatic is true',
    path: ['code'],
  })
export type CreatePromotionInput = z.input<typeof createPromotionInput>

export const updatePromotionInput = z.object({
  code: z.string().trim().toUpperCase().min(1).nullable().optional(),
  isAutomatic: z.boolean().optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  campaignId: z.string().trim().min(1).nullable().optional(),
  rules: z.array(ruleInput).optional(),
  applicationMethod: updateApplicationMethodInput.optional(),
  metadata,
})
export type UpdatePromotionInput = z.input<typeof updatePromotionInput>

// Batch add/remove for one rule scope (Medusa has 3 endpoints, one
// table+scope here) — "add" replaces the whole scope's rule set (delete +
// recreate, same convention as price-list rules) since a partial patch of an
// AND-of-rules group is ambiguous; "remove" is listed for symmetry with the
// Medusa endpoint shape but is a no-op once "add" already replaces wholesale
// — kept so the route accepts the same body shape Medusa's admin UI posts.
export const promotionRulesBatchInput = z.object({
  add: z.array(ruleInput).optional(),
  remove: z.array(z.string()).optional(),
})
export type PromotionRulesBatchInput = z.input<typeof promotionRulesBatchInput>

// --- Campaign -----------------------------------------------------------------

export const campaignBudgetInput = z.object({
  type: z.enum(['spend', 'usage', 'use_by_attribute']),
  currencyCode: z.string().trim().toLowerCase().min(1).optional(),
  limitAmount: z.number().int().nonnegative().nullable().optional(),
  attribute: z.string().trim().min(1).optional(),
})
export type CampaignBudgetInput = z.input<typeof campaignBudgetInput>

const campaignShape = {
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  campaignIdentifier: z.string().trim().min(1).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  budget: campaignBudgetInput.nullable().optional(),
  metadata,
}

export const createCampaignInput = z.object(campaignShape).required({ name: true })
export type CreateCampaignInput = z.input<typeof createCampaignInput>

export const updateCampaignInput = z.object(campaignShape)
export type UpdateCampaignInput = z.input<typeof updateCampaignInput>

// POST /admin/campaigns/:id/promotions — attach/detach.
export const campaignPromotionsInput = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})
export type CampaignPromotionsInput = z.input<typeof campaignPromotionsInput>

// --- Store cart promotions (POST/DELETE /store/carts/:id/promotions) --------

export const cartPromotionCodesInput = z.object({
  promotionCodes: z.array(z.string().trim().min(1)).min(1),
})
export type CartPromotionCodesInput = z.input<typeof cartPromotionCodesInput>
