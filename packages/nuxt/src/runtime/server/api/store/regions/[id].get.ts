import { createError, defineEventHandler, getRouterParam } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/regions/:id — public region detail WITH its countries.
//
// The countries are what a checkout builds its country select from: offering
// the whole world lets a shopper enter an address no shipping option covers.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const region = await services.regions.get(id)
  if (!region) throw createError({ statusCode: 404, statusMessage: 'Region not found' })
  return { region: { ...region, countries: await services.regions.countries(id) } }
})
