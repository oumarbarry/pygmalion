import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/reservations/:id, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const id = getRouterParam(event, 'id')!
  const reservation = await usePygmalion().services.inventory.reservations.get(id)
  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }
  return { reservation }
})
