import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/price-preferences — tax-inclusive pricing per currency/region.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const { limit, offset } = listQuery(event)
  return { pricePreferences: await usePygmalion().services.pricePreferences.list({ limit, offset }) }
})
