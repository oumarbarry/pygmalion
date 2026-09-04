// --- Promotions --------------------------------------------------------------
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/promotions/:id — products:delete. Soft-delete.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const promotion = await usePygmalion().services.promotions.remove(id)
  if (!promotion) throw createError({ statusCode: 404, statusMessage: 'Promotion not found' })
  return { promotion }
})
