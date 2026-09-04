import { z } from 'zod'

// Order edits + fulfillments + archive. Boundary validation (zod) shared
// by services and admin routes.

// --- Order edit (request) -----------------------------------------------------

const editAddition = z.object({
  variantId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  sku: z.string().trim().min(1).nullable().optional(),
  unitPrice: z.number().int(),
  quantity: z.number().int().positive(),
})

const editUpdate = z.object({
  lineItemId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
})

export const requestOrderEditInput = z
  .object({
    additions: z.array(editAddition).optional(),
    updates: z.array(editUpdate).optional(),
    removals: z.array(z.string().trim().min(1)).optional(),
    createdBy: z.string().trim().min(1).nullable().optional(),
  })
  .refine((v) => (v.additions?.length ?? 0) + (v.updates?.length ?? 0) + (v.removals?.length ?? 0) > 0, {
    message: 'an order edit must contain at least one change',
  })
export type RequestOrderEditInput = z.input<typeof requestOrderEditInput>

// --- Fulfillment --------------------------------------------------------------

export const createFulfillmentInput = z.object({
  items: z.array(z.object({ lineItemId: z.string().trim().min(1), quantity: z.number().int().positive() })).min(1),
  locationId: z.string().trim().min(1).nullable().optional(),
  providerId: z.string().trim().min(1).optional(),
  shippingOptionId: z.string().trim().min(1).nullable().optional(),
  requiresShipping: z.boolean().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type CreateFulfillmentInput = z.input<typeof createFulfillmentInput>

export const shipFulfillmentInput = z.object({
  trackingNumber: z.string().trim().min(1).nullable().optional(),
  trackingUrl: z.string().trim().min(1).nullable().optional(),
  labelUrl: z.string().trim().min(1).nullable().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type ShipFulfillmentInput = z.input<typeof shipFulfillmentInput>

export const archiveOrderInput = z.object({
  archived: z.boolean().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type ArchiveOrderInput = z.input<typeof archiveOrderInput>

// --- Return reason (admin CRUD referential) -----------------------------------

export const createReturnReasonInput = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  parentReturnReasonId: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type CreateReturnReasonInput = z.input<typeof createReturnReasonInput>

export const updateReturnReasonInput = z.object({
  value: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type UpdateReturnReasonInput = z.input<typeof updateReturnReasonInput>

// --- Return (request -> receive -> cancel) ------------------------------------

export const requestReturnInput = z.object({
  items: z
    .array(
      z.object({
        lineItemId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        reasonId: z.string().trim().min(1).nullable().optional(),
        note: z.string().trim().min(1).nullable().optional(),
      }),
    )
    .min(1),
  locationId: z.string().trim().min(1).nullable().optional(),
  refundAmount: z.number().int().nonnegative().nullable().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type RequestReturnInput = z.input<typeof requestReturnInput>

export const receiveReturnInput = z.object({
  items: z
    .array(
      z.object({
        lineItemId: z.string().trim().min(1),
        // positive, not nonnegative: an all-zero receive would flip the status
        // to partially_received and block cancel without receiving anything.
        receivedQuantity: z.number().int().positive(),
        damagedQuantity: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type ReceiveReturnInput = z.input<typeof receiveReturnInput>

// --- Exchange -----------------------------------------------------------------

const outboundLine = z.object({
  variantId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  sku: z.string().trim().min(1).nullable().optional(),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  note: z.string().trim().min(1).nullable().optional(),
})

const inboundLine = z.object({
  lineItemId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  reasonId: z.string().trim().min(1).nullable().optional(),
})

export const createExchangeInput = z.object({
  inbound: z.array(inboundLine).min(1),
  outbound: z.array(outboundLine).min(1),
  locationId: z.string().trim().min(1).nullable().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type CreateExchangeInput = z.input<typeof createExchangeInput>

// --- Claim --------------------------------------------------------------------

export const createClaimInput = z
  .object({
    type: z.enum(['replace', 'refund']),
    items: z
      .array(
        z.object({
          lineItemId: z.string().trim().min(1),
          reason: z.enum(['missing_item', 'wrong_item', 'production_failure', 'other']),
          quantity: z.number().int().positive(),
          images: z.array(z.string().trim().min(1)).nullable().optional(),
          note: z.string().trim().min(1).nullable().optional(),
        }),
      )
      .min(1),
    // replace only — replacement lines shipped to the customer.
    outbound: z.array(outboundLine).optional(),
    // optional inbound leg — the customer returns the faulty items.
    inbound: z.array(inboundLine).optional(),
    // refund only — cents to refund at completion.
    refundAmount: z.number().int().positive().nullable().optional(),
    locationId: z.string().trim().min(1).nullable().optional(),
    createdBy: z.string().trim().min(1).nullable().optional(),
  })
  .refine((v) => v.type !== 'replace' || (v.outbound?.length ?? 0) > 0, {
    message: 'a replace claim must have at least one outbound (replacement) line',
  })
export type CreateClaimInput = z.input<typeof createClaimInput>

// --- Draft order --------------------------------------------------------------

export const createDraftOrderInput = z.object({
  regionId: z.string().trim().min(1),
  currencyCode: z.string().trim().min(1),
  email: z.string().trim().min(1).nullable().optional(),
  customerId: z.string().trim().min(1).nullable().optional(),
  salesChannelId: z.string().trim().min(1).nullable().optional(),
  items: z
    .array(
      z.object({
        // Catalogue line: price computed from pricing. Custom line: pass a
        // title + unitPrice (free), no variantId.
        variantId: z.string().trim().min(1).nullable().optional(),
        title: z.string().trim().min(1).optional(),
        sku: z.string().trim().min(1).nullable().optional(),
        unitPrice: z.number().int().nonnegative().optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  shippingMethod: z
    .object({
      shippingOptionId: z.string().trim().min(1).nullable().optional(),
      name: z.string().trim().min(1),
      amount: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  shippingAddress: z.record(z.string(), z.unknown()).nullable().optional(),
  billingAddress: z.record(z.string(), z.unknown()).nullable().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type CreateDraftOrderInput = z.input<typeof createDraftOrderInput>

export const completeDraftOrderInput = z.object({
  markPaid: z.boolean().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
})
export type CompleteDraftOrderInput = z.input<typeof completeDraftOrderInput>
