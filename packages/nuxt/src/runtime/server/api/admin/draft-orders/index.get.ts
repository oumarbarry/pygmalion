import { defineEventHandler } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/draft-orders?limit&offset — drafts only (is_draft_order=true).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'read')
  const { limit, offset } = listQuery(event)
  const draftOrders = await usePygmalion().services.draftOrders.list({ limit, offset })
  return { draftOrders }
})
