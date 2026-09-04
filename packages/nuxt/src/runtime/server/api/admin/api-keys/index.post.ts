import { emitDomainEvent } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requirePermission, staffAuth } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

const createApiKeyInput = z.object({
  type: z.enum(['publishable', 'secret']).default('publishable'),
  name: z.string().trim().min(1).optional(),
  // Only meaningful for `type: 'publishable'`: sales-channel scoping.
  salesChannelIds: z.array(z.string()).optional(),
})

// `pk_`/`sk_` distinguishes the two key kinds inside the single better-auth
// `staff_api_key` table (the plugin covers hash/revocation). No dedicated
// column needed.
const PREFIX = { publishable: 'pk_', secret: 'sk_' } as const

// POST /api/admin/api-keys — settings:create. Creates a secret or publishable
// key via the better-auth `api-key` plugin, then (publishable only) scopes it
// to sales channels.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createApiKeyInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid api key', data: parsed.error.issues })
  }
  const { type, name, salesChannelIds } = parsed.data
  const staffId = event.context.staff!.user.id

  const created = await staffAuth().api.createApiKey({
    body: { prefix: PREFIX[type], name, userId: staffId },
  })

  const { db, services } = usePygmalion()
  if (type === 'publishable' && salesChannelIds && salesChannelIds.length > 0) {
    await services.salesChannels.updateKeyChannels(created.id, { add: salesChannelIds })
  }
  await emitDomainEvent(db, 'api-key.created', { id: created.id, type })

  setResponseStatus(event, 201)
  return { apiKey: created }
})
