import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/price-preferences/:id
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const pricePreference = await usePygmalion().services.pricePreferences.get(id)
  if (!pricePreference) throw createError({ statusCode: 404, statusMessage: 'Price preference not found' })
  return { pricePreference }
})
