import { defineEventHandler } from 'h3'
import { requirePermission } from '../utils/auth'
import { listQuery } from '../utils/list-query'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/customers?limit&offset&q — customers:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers', 'read')
  const { limit, offset, q } = listQuery(event)
  const customers = await usePygmalion().services.customers.list({
    limit,
    offset,
    q,
  })
  return { customers }
})
