import { createProductInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/products — products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createProductInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid product', data: parsed.error.issues })
  }
  const product = await usePygmalion().services.products.create(parsed.data)
  setResponseStatus(event, 201)
  return { product }
})
