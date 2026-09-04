import { createDraftOrderInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/draft-orders — create a draft (catalogue or custom lines).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'orders', 'update')
  const parsed = createDraftOrderInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid draft order', data: parsed.error.issues })
  const staff = event.context.staff
  const draftOrder = await usePygmalion().services.draftOrders.create({ ...parsed.data, createdBy: staff?.user.id ?? null })
  setResponseStatus(event, 201)
  return { draftOrder }
})
