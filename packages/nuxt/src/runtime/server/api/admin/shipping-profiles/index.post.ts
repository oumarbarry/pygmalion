import { createShippingProfileInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/shipping-profiles — settings:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createShippingProfileInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid shipping profile', data: parsed.error.issues })
  }
  const shippingProfile = await usePygmalion().services.shipping.profiles.create(parsed.data)
  setResponseStatus(event, 201)
  return { shippingProfile }
})
