import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/reservations?limit&offset&inventoryItemId&locationId&lineItemId
// products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const query = getQuery(event)
  const { limit, offset } = listQuery(event)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const reservations = await usePygmalion().services.inventory.reservations.list({
    limit,
    offset,
    inventoryItemId: str(query.inventoryItemId),
    locationId: str(query.locationId),
    lineItemId: str(query.lineItemId),
  })
  return { reservations }
})
