// --- Promotions --------------------------------------------------------------
import { createPromotionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/promotions — products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createPromotionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid promotion', data: parsed.error.issues })
  }
  const promotion = await usePygmalion().services.promotions.create(parsed.data)
  setResponseStatus(event, 201)
  return { promotion }
})
