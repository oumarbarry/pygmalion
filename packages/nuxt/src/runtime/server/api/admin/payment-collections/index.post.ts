import { createOrderPaymentCollectionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/payment-collections — additional collection on an order
// (order edit raising the total, exchange difference…). `amount` omitted =
// the whole outstanding amount; the service caps it either way.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const parsed = createOrderPaymentCollectionInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid payment collection', data: parsed.error.issues })
  const { services } = usePygmalion()
  try {
    const collection = await services.payment.collections.createForOrder(parsed.data)
    return { paymentCollection: await services.payment.collections.get(collection.id) }
  } catch (e) {
    throw createError({ statusCode: 422, statusMessage: (e as Error).message })
  }
})
