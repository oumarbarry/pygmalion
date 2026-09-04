import { updateShippingProfileInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/shipping-profiles/:id — settings:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateShippingProfileInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid shipping profile', data: parsed.error.issues })
  }
  const shippingProfile = await usePygmalion().services.shipping.profiles.update(id, parsed.data)
  if (!shippingProfile) throw createError({ statusCode: 404, statusMessage: 'Shipping profile not found' })
  return { shippingProfile }
})
