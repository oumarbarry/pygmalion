import { createRegionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/regions — create (with optional `countries[]`, iso2 codes).
export default defineEventHandler(async (event) => {
  const parsed = createRegionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid region', data: parsed.error.issues })
  }
  try {
    const region = await usePygmalion().services.regions.create(parsed.data)
    setResponseStatus(event, 201)
    return { region }
  } catch (err) {
    if (err instanceof Error && /unknown country/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
