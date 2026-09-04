import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/collections/:id — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const collection = await usePygmalion().services.collections.get(id)
  if (!collection) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }
  return { collection }
})
