import { createPriceListInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/price-lists, products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createPriceListInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid price list', data: parsed.error.issues })
  }
  const priceList = await usePygmalion().services.pricing.createPriceList(parsed.data)
  setResponseStatus(event, 201)
  return { priceList }
})
