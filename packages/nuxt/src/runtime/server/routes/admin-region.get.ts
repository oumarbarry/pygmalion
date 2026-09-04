import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/regions/:id
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const region = await usePygmalion().services.regions.get(id)
  if (!region) {
    throw createError({ statusCode: 404, statusMessage: 'Region not found' })
  }
  return { region }
})
