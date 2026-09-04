import { defineEventHandler } from 'h3'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/product-tags?limit&offset&q — public storefront listing.
export default defineEventHandler(async (event) => {
  const { limit, offset, q } = listQuery(event)
  const tags = await usePygmalion().services.tags.list({
    limit,
    offset,
    q,
  })
  return { tags }
})
