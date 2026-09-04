import { z } from 'zod'

// --- Pricing -------------------------------------------------------------------

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

// Closed enum (deliberate simplification), see schema/pricing.ts.
export const priceRuleAttribute = z.enum(['region_id', 'currency_code', 'customer_group_id'])
export const pricingRuleOperator = z.enum(['eq', 'gt', 'gte', 'lt', 'lte'])

const createPriceRuleShape = z.object({
  attribute: priceRuleAttribute,
  value: z.string().trim().min(1),
  operator: pricingRuleOperator.optional(),
})

// --- Price ------------------------------------------------------------------

const priceShape = {
  title: z.string().trim().min(1).nullable().optional(),
  variantId: z.string().min(1).nullable().optional(),
  shippingOptionId: z.string().min(1).nullable().optional(),
  currencyCode: z.string().trim().toLowerCase().min(1),
  // Integer cents, never float.
  amount: z.number().int().nonnegative(),
  minQuantity: z.number().int().positive().nullable().optional(),
  maxQuantity: z.number().int().positive().nullable().optional(),
  priceListId: z.string().min(1).nullable().optional(),
  rules: z.array(createPriceRuleShape).optional(),
}

export const createPriceInput = z
  .object(priceShape)
  .required({ currencyCode: true, amount: true })
  .refine((d) => Boolean(d.variantId) !== Boolean(d.shippingOptionId), {
    message: 'exactly one of variantId or shippingOptionId is required',
    path: ['variantId'],
  })
export type CreatePriceInput = z.input<typeof createPriceInput>

// Owner (variantId/shippingOptionId) and currencyCode are immutable after
// creation — same "core identity fields don't move" convention as the rest
// of the codebase (e.g. product handle vs sku).
export const updatePriceInput = z.object({
  title: z.string().trim().min(1).nullable().optional(),
  amount: z.number().int().nonnegative().optional(),
  minQuantity: z.number().int().positive().nullable().optional(),
  maxQuantity: z.number().int().positive().nullable().optional(),
  rules: z.array(createPriceRuleShape).optional(),
})
export type UpdatePriceInput = z.input<typeof updatePriceInput>

export const batchPricesInput = z.object({
  create: z.array(createPriceInput).optional(),
  update: z.array(updatePriceInput.extend({ id: z.string() })).optional(),
  delete: z.array(z.string()).optional(),
})
export type BatchPricesInput = z.input<typeof batchPricesInput>

// Entry shape for POST /price-lists/:id/products — variant-only (a price list
// scopes shipping-option prices too via the generic batch endpoint, but the
// "add products" convenience route is variant-scoped, as in Medusa).
export const priceListProductsInput = z.object({
  prices: z
    .array(
      z.object({
        variantId: z.string().min(1),
        currencyCode: z.string().trim().toLowerCase().min(1),
        amount: z.number().int().nonnegative(),
        minQuantity: z.number().int().positive().nullable().optional(),
        maxQuantity: z.number().int().positive().nullable().optional(),
        title: z.string().trim().min(1).nullable().optional(),
        rules: z.array(createPriceRuleShape).optional(),
      }),
    )
    .min(1),
})
export type PriceListProductsInput = z.input<typeof priceListProductsInput>

// --- PriceList ----------------------------------------------------------------

const priceListRuleShape = z.object({
  attribute: priceRuleAttribute,
  value: z.array(z.string().trim().min(1)).min(1),
})

const priceListShape = {
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  status: z.enum(['draft', 'active']).optional(),
  type: z.enum(['sale', 'override']).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  metadata,
  rules: z.array(priceListRuleShape).optional(),
}

export const createPriceListInput = z.object(priceListShape).required({ title: true })
export type CreatePriceListInput = z.input<typeof createPriceListInput>

export const updatePriceListInput = z.object(priceListShape)
export type UpdatePriceListInput = z.input<typeof updatePriceListInput>
