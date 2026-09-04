import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/payments/payment-providers — installed payment providers
// (the id to pass when opening a payment session on a collection).
export default defineEventHandler((event) => {
  requirePermission(event, 'orders', 'read')
  return { paymentProviders: usePygmalion().providers.list('payment') }
})
