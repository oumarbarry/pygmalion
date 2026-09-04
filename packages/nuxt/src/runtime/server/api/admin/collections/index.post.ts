import { createCollectionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/collections — products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createCollectionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid collection', data: parsed.error.issues })
  }
  const collection = await usePygmalion().services.collections.create(parsed.data)
  setResponseStatus(event, 201)
  return { collection }
})
