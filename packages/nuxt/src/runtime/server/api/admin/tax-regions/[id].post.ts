import { updateTaxRegionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/tax-regions/:id — settings:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateTaxRegionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tax region', data: parsed.error.issues })
  }
  try {
    const taxRegion = await usePygmalion().services.taxRegions.update(id, parsed.data)
    if (!taxRegion) {
      throw createError({ statusCode: 404, statusMessage: 'Tax region not found' })
    }
    return { taxRegion }
  } catch (err) {
    if (err instanceof Error && /no tax provider/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
