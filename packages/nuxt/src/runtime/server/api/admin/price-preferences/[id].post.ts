import { updatePricePreferenceInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/price-preferences/:id — update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updatePricePreferenceInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid price preference', data: parsed.error.issues })
  const pricePreference = await usePygmalion().services.pricePreferences.update(id, parsed.data)
  if (!pricePreference) throw createError({ statusCode: 404, statusMessage: 'Price preference not found' })
  return { pricePreference }
})
