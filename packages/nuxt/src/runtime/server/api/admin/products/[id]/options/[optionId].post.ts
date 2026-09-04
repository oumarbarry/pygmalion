import { updateOptionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../../../utils/auth'
import { usePygmalion } from '../../../../../utils/pygmalion'

// POST /api/admin/products/:id/options/:optionId — products:update. Values,
// when provided, wholesale-replace the option's values (refuses
// to drop a value still referenced by a live variant).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const productId = getRouterParam(event, 'id')!
  const optionId = getRouterParam(event, 'optionId')!
  const parsed = updateOptionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid option', data: parsed.error.issues })
  }
  try {
    const option = await usePygmalion().services.products.options.update(productId, optionId, parsed.data)
    if (!option) {
      throw createError({ statusCode: 404, statusMessage: 'Option not found' })
    }
    return { option }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})
