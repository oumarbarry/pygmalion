import { updateShippingOptionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/shipping-options/:id — settings:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateShippingOptionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid shipping option', data: parsed.error.issues })
  }
  let shippingOption
  try {
    shippingOption = await usePygmalion().services.shipping.options.update(id, parsed.data)
  } catch (err) {
    if (err instanceof Error && /(not found|does not support calculated|no fulfillment provider)/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
  if (!shippingOption) throw createError({ statusCode: 404, statusMessage: 'Shipping option not found' })
  return { shippingOption }
})
