import { createTaxRateInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/tax-rates — settings:create. Accepts nested `rules[]`.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createTaxRateInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tax rate', data: parsed.error.issues })
  }
  const taxRate = await usePygmalion().services.taxRates.create({
    ...parsed.data,
    createdBy: event.context.staff?.user.id,
  })
  setResponseStatus(event, 201)
  return { taxRate }
})
