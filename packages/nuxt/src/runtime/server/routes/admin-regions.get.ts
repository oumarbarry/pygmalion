import { defineEventHandler } from 'h3'
import { listQuery } from '../utils/list-query'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/regions?limit&offset&q
export default defineEventHandler(async (event) => {
  const { limit, offset, q } = listQuery(event)
  const regions = await usePygmalion().services.regions.list({
    limit,
    offset,
    q,
  })
  return { regions }
})
