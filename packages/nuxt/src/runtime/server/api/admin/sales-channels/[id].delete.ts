import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// DELETE /api/admin/sales-channels/:id — settings:delete. Soft-delete,
// blocked while it's the store's default channel (mirrors regions' guard).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'delete')
  const id = getRouterParam(event, 'id')!
  try {
    const salesChannel = await usePygmalion().services.salesChannels.remove(id)
    if (!salesChannel) {
      throw createError({ statusCode: 404, statusMessage: 'Sales channel not found' })
    }
    return { salesChannel }
  } catch (err) {
    if (err instanceof Error && /store default sales channel/.test(err.message)) {
      throw createError({ statusCode: 409, statusMessage: err.message })
    }
    throw err
  }
})
