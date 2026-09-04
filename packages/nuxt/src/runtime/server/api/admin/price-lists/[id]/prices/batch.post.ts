import { batchPricesInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/price-lists/:id/prices/batch, products:update. Create/
// update/delete prices in bulk, all scoped to this list.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const priceList = await services.pricing.getPriceList(id)
  if (!priceList) {
    throw createError({ statusCode: 404, statusMessage: 'Price list not found' })
  }
  const parsed = batchPricesInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid prices batch', data: parsed.error.issues })
  }
  const result = await services.pricing.batchPrices(parsed.data, { forcePriceListId: id })
  return result
})
