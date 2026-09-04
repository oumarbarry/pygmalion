import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { requirePermission } from '../../../../utils/auth'
import { usePygmalion } from '../../../../utils/pygmalion'

const body = z.object({
  add: z.array(z.string().trim().min(1)).optional(),
  remove: z.array(z.string().trim().min(1)).optional(),
})

// POST /api/admin/product-tags/:id/products {add,remove}, attach/detach.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const tagId = getRouterParam(event, 'id')!
  const parsed = body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid tag products input', data: parsed.error.issues })
  const productIds = await usePygmalion().services.tags.setProducts(tagId, parsed.data)
  return { productIds }
})
