import { createReservationInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/reservations — products:create. Raw single-item
// reservation (no kit expansion; that's `reserveVariants`, cart-facing,
// consumed by the cart service).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createReservationInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid reservation', data: parsed.error.issues })
  }
  try {
    const reservation = await usePygmalion().services.inventory.reservations.create(parsed.data)
    setResponseStatus(event, 201)
    return { reservation }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
