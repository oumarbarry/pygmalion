import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// DELETE /api/admin/products/:id/options/:optionId — products:delete.
// Refuses (422) to remove an option still used by a live variant.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'delete')
  const productId = getRouterParam(event, 'id')!
  const optionId = getRouterParam(event, 'optionId')!
  try {
    const option = await usePygmalion().services.products.options.remove(productId, optionId)
    if (!option) {
      throw createError({ statusCode: 404, statusMessage: 'Option not found' })
    }
    return { option }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
