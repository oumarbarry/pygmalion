import { defineEventHandler } from 'h3'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/regions?q&limit&offset — public: a storefront needs the region
// (currency, countries) before it can even create a cart.
export default defineEventHandler(async (event) => {
  const { limit, offset, q } = listQuery(event)
  return { regions: await usePygmalion().services.regions.list({ limit, offset, q }) }
})
