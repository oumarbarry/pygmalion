import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

// --- Customer profile (self-service `/me` and admin update share this) -----

// Admin-created customer: no credential, the row is a guest
// until that email signs up through better-auth.
export const createCustomerInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  metadata,
})
export type CreateCustomerInput = z.input<typeof createCustomerInput>

export const updateCustomerInput = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  metadata,
})
export type UpdateCustomerInput = z.input<typeof updateCustomerInput>

// --- CustomerAddress ---------------------------------------------------------

export const createCustomerAddressInput = z.object({
  addressName: z.string().trim().min(1).nullable().optional(),
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
  company: z.string().trim().nullable().optional(),
  firstName: z.string().trim().nullable().optional(),
  lastName: z.string().trim().nullable().optional(),
  address1: z.string().trim().nullable().optional(),
  address2: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  countryCode: z.string().trim().toUpperCase().length(2).nullable().optional(),
  province: z.string().trim().nullable().optional(),
  postalCode: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  metadata,
})
export type CreateCustomerAddressInput = z.input<typeof createCustomerAddressInput>

export const updateCustomerAddressInput = createCustomerAddressInput.partial()
export type UpdateCustomerAddressInput = z.input<typeof updateCustomerAddressInput>

// --- CustomerGroup ------------------------------------------------------------

export const createCustomerGroupInput = z.object({
  name: z.string().trim().min(1),
  metadata,
})
export type CreateCustomerGroupInput = z.input<typeof createCustomerGroupInput>

export const updateCustomerGroupInput = z.object({
  name: z.string().trim().min(1).optional(),
  metadata,
})
export type UpdateCustomerGroupInput = z.input<typeof updateCustomerGroupInput>

// Batch add/remove — mirrors Medusa's single `/admin/customer-groups/:id/customers` endpoint.
export const groupMembersInput = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})
export type GroupMembersInput = z.input<typeof groupMembersInput>
