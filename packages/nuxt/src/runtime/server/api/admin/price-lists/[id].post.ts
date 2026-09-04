import { updatePriceListInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/price-lists/:id, products:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updatePriceListInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid price list', data: parsed.error.issues })
  }
  const priceList = await usePygmalion().services.pricing.updatePriceList(id, parsed.data)
  if (!priceList) {
    throw createError({ statusCode: 404, statusMessage: 'Price list not found' })
  }
  return { priceList }
})
