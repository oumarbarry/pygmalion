import { createOptionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/products/:id/options — products:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const parsed = createOptionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid option', data: parsed.error.issues })
  }
  try {
    const option = await usePygmalion().services.products.options.create(productId, parsed.data)
    setResponseStatus(event, 201)
    return { option }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
