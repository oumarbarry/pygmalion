import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/shipping-options/:id — settings:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const shippingOption = await services.shipping.options.get(id)
  if (!shippingOption) throw createError({ statusCode: 404, statusMessage: 'Shipping option not found' })
  const rules = await services.shipping.options.rules(id)
  return { shippingOption, rules }
})
