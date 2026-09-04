import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/collections/:id — public storefront detail.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const collection = await usePygmalion().services.collections.get(id)
  if (!collection) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }
  return { collection }
})
