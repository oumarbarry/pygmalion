import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/product-categories/:id — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const category = await usePygmalion().services.categories.get(id)
  if (!category) {
    throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  }
  return { category }
})
