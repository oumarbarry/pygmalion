import { updateReservationInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/reservations/:id, products:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateReservationInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid reservation', data: parsed.error.issues })
  }
  const reservation = await usePygmalion().services.inventory.reservations.update(id, parsed.data)
  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }
  return { reservation }
})
