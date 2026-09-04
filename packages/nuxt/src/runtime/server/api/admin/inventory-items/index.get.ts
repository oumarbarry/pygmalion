import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/inventory-items?limit&offset&q, products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const { limit, offset, q } = listQuery(event)
  const inventoryItems = await usePygmalion().services.inventory.items.list({
    limit,
    offset,
    q,
  })
  return { inventoryItems }
})
