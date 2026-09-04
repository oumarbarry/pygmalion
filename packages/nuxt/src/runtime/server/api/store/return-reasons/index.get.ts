import { defineEventHandler } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/return-reasons — the referential a customer picks from when
// requesting a return. Public read-only (bounded referential, no pagination).
export default defineEventHandler(async () => {
  return { returnReasons: await usePygmalion().services.returns.reasons.list() }
})
