import { createShippingOptionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/shipping-options — settings:create. `price_type:
// calculated` requires the provider's `canCalculate` to return true
// (enforced by the service, surfaced here as a 422).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createShippingOptionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid shipping option', data: parsed.error.issues })
  }
  try {
    const shippingOption = await usePygmalion().services.shipping.options.create(parsed.data)
    setResponseStatus(event, 201)
    return { shippingOption }
  } catch (err) {
    if (err instanceof Error && /(not found|does not support calculated|no fulfillment provider)/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
