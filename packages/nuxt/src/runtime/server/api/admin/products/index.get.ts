import type { ProductStatusValue } from '@oumarbarry/pygmalion-core'
import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

const STATUSES: ProductStatusValue[] = ['draft', 'proposed', 'published', 'rejected']

// GET /api/admin/products?limit&offset&q&status&handle&collection_id[]&category_id[]&tag_id[]
// — products:read.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'read')
  const query = getQuery(event)
  const { limit, offset, q } = listQuery(event)
  const toIds = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.map(String)
    if (typeof v === 'string' && v) return [v]
    return undefined
  }
  const status = STATUSES.find((s) => s === query.status)
  const products = await usePygmalion().services.products.list({
    limit,
    offset,
    q,
    handle: typeof query.handle === 'string' && query.handle ? query.handle : undefined,
    status,
    collectionIds: toIds(query['collection_id[]']),
    categoryIds: toIds(query['category_id[]']),
    tagIds: toIds(query['tag_id[]']),
  })
  return { products }
})
