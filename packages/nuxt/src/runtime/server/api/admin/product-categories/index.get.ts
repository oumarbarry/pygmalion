import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/product-categories?limit&offset&q&parent_category_id&is_active&is_internal — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const query = getQuery(event)
  const { limit, offset, q } = listQuery(event)
  const toBool = (v: unknown) => (v === 'true' ? true : v === 'false' ? false : undefined)
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
    isActive: toBool(query.is_active),
    isInternal: toBool(query.is_internal),
  })
  return { categories }
})
