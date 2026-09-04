import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useStorage } from 'nitropack/runtime'
import { requirePermission } from '../../../utils/auth'

// Same allowlist as the GET route — closes path traversal into the
// unstorage key/fs path via a crafted `:id`.
const SAFE_ID = /^[A-Za-z0-9_.-]+$/

// DELETE /api/admin/uploads/:id — products:update.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const id = getRouterParam(event, 'id')!
  if (!SAFE_ID.test(id) || id.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file id' })
  }
  const storage = useStorage('pygmalion:files')
  const exists = await storage.hasItem(id)
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }
  await storage.removeItem(id)
  return { id }
})
