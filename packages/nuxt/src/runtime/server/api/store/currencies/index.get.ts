import { defineEventHandler } from 'h3'
import { listQuery } from '../../../utils/list-query'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/currencies?q&limit&offset — public reference table.
export default defineEventHandler(async (event) => {
  const { limit, offset, q } = listQuery(event)
  return { currencies: await usePygmalion().services.currencies.list({ limit, offset, q }) }
})
