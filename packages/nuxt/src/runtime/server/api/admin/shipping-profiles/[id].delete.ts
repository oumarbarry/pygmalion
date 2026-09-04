import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/shipping-profiles/:id — settings:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const shippingProfile = await usePygmalion().services.shipping.profiles.remove(id)
  if (!shippingProfile) throw createError({ statusCode: 404, statusMessage: 'Shipping profile not found' })
  return { shippingProfile }
})
