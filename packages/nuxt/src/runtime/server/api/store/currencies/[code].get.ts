import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/currencies/:code — case-insensitive (service lowercases).
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')!
  const currency = await usePygmalion().services.currencies.get(code)
  if (!currency) throw createError({ statusCode: 404, statusMessage: 'Currency not found' })
  return { currency }
})
