import { refundPaymentInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { usePygmalion } from '../../../../utils/pygmalion'

// POST /api/admin/orders/:id/refund — partial or full refund. Records a signed
// negative append-only order_transaction.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const parsed = refundPaymentInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid refund', data: parsed.error.issues })
  const { services } = usePygmalion()
  const order = await services.checkout.refundOrder(id, parsed.data)
  return { order }
})
