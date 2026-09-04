import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// GET /api/admin/products/:id/options — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const productId = getRouterParam(event, 'id')!
  const options = await usePygmalion().services.products.options.list(productId)
  return { options }
})
