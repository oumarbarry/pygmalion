import { createStockLocationInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/stock-locations, settings:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createStockLocationInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid stock location', data: parsed.error.issues })
  }
  const stockLocation = await usePygmalion().services.inventory.locations.create(parsed.data)
  setResponseStatus(event, 201)
  return { stockLocation }
})
