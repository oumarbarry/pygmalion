import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/shipping-options/:id — settings:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  const shippingOption = await usePygmalion().services.shipping.options.remove(id)
  if (!shippingOption) throw createError({ statusCode: 404, statusMessage: 'Shipping option not found' })
  return { shippingOption }
})
