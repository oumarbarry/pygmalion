import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// DELETE /api/admin/regions/:id — soft-delete, blocked while countries are
// still assigned to the region (mirrors the DB-level FK RESTRICT on
// region_country.region_id).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  try {
    const region = await usePygmalion().services.regions.remove(id)
    if (!region) {
      throw createError({ statusCode: 404, statusMessage: 'Region not found' })
    }
    return { region }
  } catch (err) {
    if (err instanceof Error && /countries assigned/.test(err.message)) {
      throw createError({ statusCode: 409, statusMessage: err.message })
    }
    throw err
  }
})
