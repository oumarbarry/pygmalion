import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()

// An https/http URL only — the delivery worker POSTs to it verbatim.
const endpointUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'url must be http(s)' })

// `'*'` = every domain event; otherwise exact event names (`order.placed`, …).
const eventNames = z.array(z.string().trim().min(1)).min(1)

export const createWebhookEndpointInput = z.object({
  url: endpointUrl,
  events: eventNames,
  active: z.boolean().optional(),
  description: z.string().trim().nullable().optional(),
  metadata,
})
export type CreateWebhookEndpointInput = z.input<typeof createWebhookEndpointInput>

export const updateWebhookEndpointInput = z.object({
  url: endpointUrl.optional(),
  events: eventNames.optional(),
  active: z.boolean().optional(),
  description: z.string().trim().nullable().optional(),
  metadata,
})
export type UpdateWebhookEndpointInput = z.input<typeof updateWebhookEndpointInput>
