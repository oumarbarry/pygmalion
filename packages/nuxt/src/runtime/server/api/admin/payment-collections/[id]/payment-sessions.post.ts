import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

const input = z.object({ providerId: z.string().min(1).default('manual') })

// POST /api/admin/payment-collections/:id/payment-sessions — open a provider
// session on a collection (the seam a provider redirect / webhook then
// authorizes). Manual encashment goes through mark-as-paid instead.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = input.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid payment session', data: parsed.error.issues })
  const { services } = usePygmalion()
  try {
    const session = await services.payment.sessions.create({ collectionId: id, providerId: parsed.data.providerId })
    return { paymentSession: session }
  } catch (e) {
    throw createError({ statusCode: 422, statusMessage: (e as Error).message })
  }
})
