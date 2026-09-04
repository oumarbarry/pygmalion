import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/stores/:id, the store is a singleton, so this
// just checks the requested id matches it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const store = await usePygmalion().services.stores.get()
  if (!store || store.id !== id) {
    throw createError({ statusCode: 404, statusMessage: 'Store not found' })
  }
  return { store }
})
