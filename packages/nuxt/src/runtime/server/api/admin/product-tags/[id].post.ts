import { updateTagInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/product-tags/:id — products:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateTagInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tag', data: parsed.error.issues })
  }
  const tag = await usePygmalion().services.tags.update(id, parsed.data)
  if (!tag) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }
  return { tag }
})
