import { updateProductInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/products/:id — products:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateProductInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid product', data: parsed.error.issues })
  }
  const product = await usePygmalion().services.products.update(id, parsed.data)
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  return { product }
})
