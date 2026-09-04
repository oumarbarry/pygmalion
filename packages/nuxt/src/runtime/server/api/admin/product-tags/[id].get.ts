import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/product-tags/:id — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const tag = await usePygmalion().services.tags.get(id)
  if (!tag) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }
  return { tag }
})
