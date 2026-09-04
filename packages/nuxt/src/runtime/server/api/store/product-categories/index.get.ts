import { defineEventHandler, getQuery } from 'h3'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/product-categories?limit&offset&q&parent_category_id — public
// listing scoped to is_active AND NOT is_internal.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { limit, offset, q } = listQuery(event)
  const categories = await usePygmalion().services.categories.list({
    limit,
    offset,
    q,
    parentCategoryId:
      query.parent_category_id === 'null'
        ? null
        : typeof query.parent_category_id === 'string'
          ? query.parent_category_id
          : undefined,
    storefront: true,
  })
  return { categories }
})
