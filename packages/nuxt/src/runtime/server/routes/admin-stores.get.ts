import { defineEventHandler } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// GET /api/admin/stores — Medusa parity: a list, usually a single row.
export default defineEventHandler(async () => {
  const stores = await usePygmalion().services.stores.list()
  return { stores }
})
