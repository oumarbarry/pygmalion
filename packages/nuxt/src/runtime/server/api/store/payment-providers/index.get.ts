import { defineEventHandler } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/payment-providers — providers the storefront may open a
// session with. Public (same exposure as the checkout it feeds): ids only,
// never provider configuration.
export default defineEventHandler(() => {
  return { paymentProviders: usePygmalion().providers.list('payment') }
})
