import { defineEventHandler } from 'h3'
import { listQuery } from '../utils/list-query'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/currencies?limit&offset&q — read-only reference table.
export default defineEventHandler(async (event) => {
  const { limit, offset, q } = listQuery(event)
  const currencies = await usePygmalion().services.currencies.list({
    limit,
    offset,
    q,
  })
  return { currencies }
})
