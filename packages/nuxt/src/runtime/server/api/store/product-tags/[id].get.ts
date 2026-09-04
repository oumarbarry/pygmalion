import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/product-tags/:id — public storefront detail.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const tag = await usePygmalion().services.tags.get(id)
  if (!tag) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }
  return { tag }
})
