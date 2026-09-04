import { updateCollectionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/collections/:id — products:update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateCollectionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid collection', data: parsed.error.issues })
  }
  const collection = await usePygmalion().services.collections.update(id, parsed.data)
  if (!collection) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }
  return { collection }
})
