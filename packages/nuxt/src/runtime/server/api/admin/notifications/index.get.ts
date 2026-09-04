import { createError, defineEventHandler, getQuery } from 'h3'
import { z } from 'zod'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

const listQuery = z.object({
  to: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/admin/notifications?to&limit&offset — what the framework queued and
// what the provider did with it.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const parsed = listQuery.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid query', data: parsed.error.issues })
  return { notifications: await usePygmalion().services.notifications.list(parsed.data) }
})
