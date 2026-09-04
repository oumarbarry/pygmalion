// --- Promotions --------------------------------------------------------------
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/promotions/:id — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const promotion = await usePygmalion().services.promotions.get(id)
  if (!promotion) throw createError({ statusCode: 404, statusMessage: 'Promotion not found' })
  return { promotion }
})
