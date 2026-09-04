import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

// --- SalesChannel -----------------------------------------------------------

export const createSalesChannelInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  isDisabled: z.boolean().optional(),
  metadata,
})
export type CreateSalesChannelInput = z.input<typeof createSalesChannelInput>

export const updateSalesChannelInput = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  isDisabled: z.boolean().optional(),
  metadata,
})
export type UpdateSalesChannelInput = z.input<typeof updateSalesChannelInput>

// --- Batch add/remove (channel<->product, key<->channel) --------------------
// Same `{add, remove}` shape for both link kinds (both admin
// endpoints — `sales-channels/:id/products` and `api-keys/:id/sales-channels`
// — are batch link/unlink).

export const channelProductsInput = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})
export type ChannelProductsInput = z.input<typeof channelProductsInput>

export const channelKeysInput = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})
export type ChannelKeysInput = z.input<typeof channelKeysInput>
