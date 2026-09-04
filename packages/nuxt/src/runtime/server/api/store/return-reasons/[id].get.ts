import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/return-reasons/:id — public detail.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const returnReason = await usePygmalion().services.returns.reasons.get(id)
  if (!returnReason) throw createError({ statusCode: 404, statusMessage: 'Return reason not found' })
  return { returnReason }
})
