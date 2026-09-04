import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/reservations/:id — products:delete. Releases the
// reservation (pre-fulfillment cancel: no stock is touched).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const id = getRouterParam(event, 'id')!
  const reservation = await usePygmalion().services.inventory.reservations.remove(id)
  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }
  return { reservation }
})
