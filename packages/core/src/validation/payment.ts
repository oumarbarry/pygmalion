import { z } from 'zod'

// Payment input schemas (zod at the boundary).

export const createPaymentCollectionInput = z.object({
  cartId: z.string().nullable().optional(),
  // A collection can also hang directly off an order (additional
  // collection for an order edit / exchange difference), with no cart.
  orderId: z.string().nullable().optional(),
  amount: z.number().int().nonnegative(),
  currencyCode: z.string().min(1),
})
export type CreatePaymentCollectionInput = z.infer<typeof createPaymentCollectionInput>

// POST /api/admin/payment-collections — additional collection on an order.
// `amount` omitted = the order's outstanding amount (total - authorized).
export const createOrderPaymentCollectionInput = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive().optional(),
})
export type CreateOrderPaymentCollectionInput = z.infer<typeof createOrderPaymentCollectionInput>

// POST /api/admin/payment-collections/:id/mark-as-paid
export const markAsPaidInput = z.object({
  providerId: z.string().min(1).default('manual'),
  createdBy: z.string().nullable().optional(),
})
export type MarkAsPaidInput = z.infer<typeof markAsPaidInput>

export const createPaymentSessionInput = z.object({
  collectionId: z.string().min(1),
  providerId: z.string().min(1),
  context: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type CreatePaymentSessionInput = z.infer<typeof createPaymentSessionInput>

// Store POST /store/payment-collections — create collection + session in one call.
export const startPaymentInput = z.object({
  cartId: z.string().min(1),
  providerId: z.string().min(1).default('manual'),
})
export type StartPaymentInput = z.infer<typeof startPaymentInput>

export const capturePaymentInput = z.object({
  amount: z.number().int().positive(),
  createdBy: z.string().nullable().optional(),
})
export type CapturePaymentInput = z.infer<typeof capturePaymentInput>

export const refundPaymentInput = z.object({
  amount: z.number().int().positive(),
  note: z.string().nullable().optional(),
  refundReasonId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
})
export type RefundPaymentInput = z.infer<typeof refundPaymentInput>

// --- RefundReason — CRUD referential, mirror of return reasons ---------------

export const createRefundReasonInput = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type CreateRefundReasonInput = z.infer<typeof createRefundReasonInput>

export const updateRefundReasonInput = createRefundReasonInput.partial()
export type UpdateRefundReasonInput = z.infer<typeof updateRefundReasonInput>
