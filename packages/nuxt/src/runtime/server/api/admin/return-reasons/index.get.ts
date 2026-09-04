import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/return-reasons — list the return-reason referential.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  return { returnReasons: await usePygmalion().services.returns.reasons.list() }
})
