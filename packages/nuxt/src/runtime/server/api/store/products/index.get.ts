import { defineEventHandler, getQuery } from 'h3'
import { listQuery } from '../../../utils/list-query'
import { withStoreVariants } from '../../../utils/store-catalog'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/products?limit&offset&q&collection_id[]&category_id[]&tag_id[]
// &region_id|currency_code
// public storefront listing. Published only (store is read-only on the
// catalog). `category_id[]` additionally widens to every live
// descendant (mpath) so a product filed under a sub-category still surfaces
// when its parent is filtered on.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { limit, offset, q } = listQuery(event)
  const toIds = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.map(String)
    if (typeof v === 'string' && v) return [v]
    return undefined
  }
  const { services } = usePygmalion()
  // Sales-channel scoping: skip the filter while the store has
  // at most one active channel (Medusa parity); a fresh /
  // single-channel store stays fully browsable even with no products
  // explicitly linked to a channel yet.
  const scoped = await services.salesChannels.hasMultipleChannels()
  const categoryIds = toIds(query['category_id[]'])
  const products = await services.products.list({
    limit,
    offset,
    q,
    status: 'published',
    channelIds: scoped ? event.context.saleschannels : undefined,
    collectionIds: toIds(query['collection_id[]']),
    categoryIds: categoryIds ? await services.categories.subtreeIds(categoryIds) : undefined,
    tagIds: toIds(query['tag_id[]']),
  })
  // With a price context, each product carries its priced variants so a
  // catalogue grid can print "from X" without an extra call per card.
  return { products: await withStoreVariants(event, products) }
})
