import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// GET /api/admin/products/:id/variants — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const productId = getRouterParam(event, 'id')!
  const variants = await usePygmalion().services.products.variants.list(productId)
  return { variants }
})
