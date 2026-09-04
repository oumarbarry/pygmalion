import { updateCategoryInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '../../../utils/auth'
import { usePygmalion } from '../../../utils/pygmalion'

// POST /api/admin/product-categories/:id — products:update. Reparenting
// (`parentCategoryId`, incl. explicit `null`) recalculates this row's mpath
// and every descendant's (tested on 3 levels).
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  const parsed = updateCategoryInput.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid category', data: parsed.error.issues })
  }
  try {
    const category = await usePygmalion().services.categories.update(id, parsed.data)
    if (!category) {
      throw createError({ statusCode: 404, statusMessage: 'Category not found' })
    }
    return { category }
  } catch (err) {
    if (
      err instanceof Error &&
      /(parent category not found|cannot be its own parent|cannot move a category)/.test(err.message)
    ) {
      throw createError({ statusCode: 409, statusMessage: err.message })
    }
    throw err
  }
})
