import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/shipping-profiles/:id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const shippingProfile = await services.shipping.profiles.get(id)
  if (!shippingProfile) throw createError({ statusCode: 404, statusMessage: 'Shipping profile not found' })
  const productIds = await services.shipping.profiles.listProductIds(id)
  return { shippingProfile, productIds }
})
