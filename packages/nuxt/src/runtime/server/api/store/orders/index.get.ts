import { defineEventHandler } from 'h3'
import { requireCustomer } from '../../../utils/customer-auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/orders?limit&offset — the signed-in customer's orders
// (drafts excluded).
export default defineEventHandler(async (event) => {
  const customer = requireCustomer(event)
  const { limit, offset } = listQuery(event)
  const orders = await usePygmalion().services.checkout.listOrders({ customerId: customer.id, limit, offset })
  return { orders }
})
