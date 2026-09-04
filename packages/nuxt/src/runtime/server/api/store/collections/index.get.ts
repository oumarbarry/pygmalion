import { defineEventHandler } from 'h3'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/collections?limit&offset&q — public storefront listing.
export default defineEventHandler(async (event) => {
  const { limit, offset, q } = listQuery(event)
  const collections = await usePygmalion().services.collections.list({
    limit,
    offset,
    q,
  })
  return { collections }
})
