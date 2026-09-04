import { createTagInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/product-tags — products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createTagInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tag', data: parsed.error.issues })
  }
  const tag = await usePygmalion().services.tags.create(parsed.data)
  setResponseStatus(event, 201)
  return { tag }
})
