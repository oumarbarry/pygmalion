import { batchProductsInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/products/batch, products:create (batch create/update/delete).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = batchProductsInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid batch', data: parsed.error.issues })
  }
  return usePygmalion().services.products.batch(parsed.data)
})
