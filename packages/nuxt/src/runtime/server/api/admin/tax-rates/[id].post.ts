import { updateTaxRateInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/tax-rates/:id — settings:update (Medusa: POST = update).
// A `rules[]` in the body replaces the whole set (soft-delete then recreate).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateTaxRateInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tax rate', data: parsed.error.issues })
  }
  const taxRate = await usePygmalion().services.taxRates.update(id, parsed.data)
  if (!taxRate) {
    throw createError({ statusCode: 404, statusMessage: 'Tax rate not found' })
  }
  return { taxRate }
})
