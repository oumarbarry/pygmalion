import { batchPricesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/prices/batch, products:update. Generic create/update/
// delete for default (non-list) product/variant/shipping-option prices.
// Price-list-scoped
// prices go through /api/admin/price-lists/:id/prices/batch instead.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const parsed = batchPricesInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid prices batch', data: parsed.error.issues })
  }
  const result = await usePygmalion().services.pricing.batchPrices(parsed.data)
  return result
})
