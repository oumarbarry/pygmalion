import { createTaxRegionInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/tax-regions — settings:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'settings', 'create')
  const parsed = createTaxRegionInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid tax region', data: parsed.error.issues })
  }
  const { services } = usePygmalion()
  try {
    const taxRegion = await services.taxRegions.create({ ...parsed.data, createdBy: event.context.staff?.user.id })
    setResponseStatus(event, 201)
    return { taxRegion }
  } catch (err) {
    if (err instanceof Error && /(province_code is required|only allowed on a top-level|no tax provider)/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
