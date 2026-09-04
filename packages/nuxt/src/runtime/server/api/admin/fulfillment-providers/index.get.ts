import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/fulfillment-providers — installed fulfillment providers
// (`manual` by default). Same registry introspection as tax-providers.
export default defineEventHandler((event) => {
  requirePermission(event, 'settings', 'read')
  return { fulfillmentProviders: usePygmalion().providers.list('fulfillment') }
})
