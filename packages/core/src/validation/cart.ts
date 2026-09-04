// Cart input schemas.
import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

// --- Cart -----------------------------------------------------------------------

export const createCartInput = z.object({
  regionId: z.string().trim().min(1),
  salesChannelId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  metadata,
})
export type CreateCartInput = z.input<typeof createCartInput>

const addressInput = z.object({
  firstName: z.string().trim().nullable().optional(),
  lastName: z.string().trim().nullable().optional(),
  company: z.string().trim().nullable().optional(),
  address1: z.string().trim().nullable().optional(),
  address2: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  countryCode: z.string().trim().toLowerCase().length(2).nullable().optional(),
  province: z.string().trim().nullable().optional(),
  postalCode: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
})
export type CartAddressInput = z.input<typeof addressInput>

export const setCartAddressesInput = z
  .object({
    shippingAddress: addressInput.optional(),
    billingAddress: addressInput.optional(),
  })
  .refine((v) => v.shippingAddress !== undefined || v.billingAddress !== undefined, {
    message: 'at least one of shippingAddress/billingAddress is required',
  })
export type SetCartAddressesInput = z.input<typeof setCartAddressesInput>

export const setCartEmailInput = z.object({
  email: z.string().trim().email(),
})
export type SetCartEmailInput = z.input<typeof setCartEmailInput>

// --- LineItem ---------------------------------------------------------------------

export const addLineItemInput = z.object({
  variantId: z.string().trim().min(1),
  quantity: z.number().int().min(1),
  metadata,
})
export type AddLineItemInput = z.input<typeof addLineItemInput>

export const updateLineItemInput = z.object({
  quantity: z.number().int().min(1),
  metadata,
})
export type UpdateLineItemInput = z.input<typeof updateLineItemInput>

// --- ShippingMethod -----------------------------------------------------------
// When `shippingOptionId` is given, `services/shipping.ts::resolveForCart`
// resolves it against the real `shipping_option` table (zone/rules/profile
// match + price) and `name`/`amount`/`isTaxInclusive` are derived from that,
// not trusted from the body — so they're optional here. Omitting
// `shippingOptionId` keeps the original behavior (a manual/custom
// charge: caller-supplied `name`+`amount` trusted as-is), which is why both
// are still required in that case (enforced by the `.refine` below, not the
// field types — `services/cart.ts::setShippingMethod` is what actually branches).

export const setShippingMethodInput = z
  .object({
    shippingOptionId: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1).optional(),
    amount: z.number().int().min(0).optional(),
    isTaxInclusive: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.shippingOptionId) || (v.name !== undefined && v.amount !== undefined), {
    message: 'name and amount are required when shippingOptionId is not set',
  })
export type SetShippingMethodInput = z.input<typeof setShippingMethodInput>

// --- Transfer (guest -> customer) --------------------------------------------

export const transferCartInput = z.object({
  customerId: z.string().trim().min(1),
})
export type TransferCartInput = z.input<typeof transferCartInput>
