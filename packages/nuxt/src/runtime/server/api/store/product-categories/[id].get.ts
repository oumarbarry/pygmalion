import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/product-categories/:id — public detail; 404s unless visible
// (is_active AND NOT is_internal).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const category = await usePygmalion().services.categories.getStorefront(id)
  if (!category) {
    throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  }
  return { category }
})
