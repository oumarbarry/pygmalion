import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/tax-providers, tax providers registered through the
// `pygmalion:providers` hook (`system` by default). Backed by the registry's
// `list()`, which reads ids without instantiating anything.
export default defineEventHandler((event) => {
  requirePermission(event, 'settings', 'read')
  return { taxProviders: usePygmalion().providers.list('tax') }
})
