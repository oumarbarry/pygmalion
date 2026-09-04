import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/product-categories/:id — products:delete. Soft-delete
// cascades to the whole descendant subtree.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const category = await usePygmalion().services.categories.remove(id)
  if (!category) {
    throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  }
  return { category }
})
