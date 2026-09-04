import { updateRegionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/regions/:id — update (Medusa: POST = update).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const parsed = updateRegionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid region', data: parsed.error.issues })
  }
  try {
    const region = await usePygmalion().services.regions.update(id, parsed.data)
    if (!region) {
      throw createError({ statusCode: 404, statusMessage: 'Region not found' })
    }
    return { region }
  } catch (err) {
    if (err instanceof Error && /unknown country/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
