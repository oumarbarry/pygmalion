import { updateStockLocationInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/stock-locations/:id, settings:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateStockLocationInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid stock location', data: parsed.error.issues })
  }
  const stockLocation = await usePygmalion().services.inventory.locations.update(id, parsed.data)
  if (!stockLocation) {
    throw createError({ statusCode: 404, statusMessage: 'Stock location not found' })
  }
  return { stockLocation }
})
