import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/product-tags/:id — products:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const tag = await usePygmalion().services.tags.remove(id)
  if (!tag) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }
  return { tag }
})
