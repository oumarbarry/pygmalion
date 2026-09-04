import { shippingProfileProductsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/shipping-profiles/:id/products — settings:update. Batch
// add/remove (Medusa parity pattern, same as collections/:id/products) —
// "add" reassigns a product's shipping profile (one profile per product max).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = shippingProfileProductsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid products', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  const shippingProfile = await services.shipping.profiles.get(id)
  if (!shippingProfile) throw createError({ statusCode: 404, statusMessage: 'Shipping profile not found' })
  await services.shipping.profiles.updateProducts(id, parsed.data)
  const productIds = await services.shipping.profiles.listProductIds(id)
  return { productIds }
})
