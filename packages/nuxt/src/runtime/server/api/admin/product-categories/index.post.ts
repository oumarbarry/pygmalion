import { createCategoryInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/product-categories — products:create.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'create')
  const parsed = createCategoryInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid category', data: parsed.error.issues })
  }
  try {
    const category = await usePygmalion().services.categories.create(parsed.data)
    setResponseStatus(event, 201)
    return { category }
  } catch (err) {
    if (err instanceof Error && /parent category not found/.test(err.message)) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
