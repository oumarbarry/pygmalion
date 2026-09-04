import { createVariantInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/products/:id/variants — products:update. Validates the
// option-value combination inside the service.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const parsed = createVariantInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid variant', data: parsed.error.issues })
  }
  try {
    const variant = await usePygmalion().services.products.variants.create(productId, parsed.data)
    setResponseStatus(event, 201)
    return { variant }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
