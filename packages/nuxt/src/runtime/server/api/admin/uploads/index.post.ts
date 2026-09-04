import { pygId } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, readMultipartFormData, setResponseStatus } from 'h3'
import { useStorage } from 'nitropack/runtime'
import { requirePermission } from '../../../utils/auth'

// POST /api/admin/uploads, multipart file upload (deliberately simple:
// no FILE-provider abstraction, no presigned URLs; bytes go
// straight to unstorage, fs driver by default in the playground). Returns
// one `{id, url}` per uploaded file; `id` is the unstorage key, stored on
// `product_images.url` by the caller.
export default defineEventHandler(async (event) => {
  requirePermission(event, 'products', 'update')
  const parts = await readMultipartFormData(event)
  const fileParts = (parts ?? []).filter((p) => p.filename)
  if (!fileParts.length) {
    throw createError({ statusCode: 422, statusMessage: 'No file uploaded' })
  }
  const storage = useStorage('pygmalion:files')
  const files = []
  for (const part of fileParts) {
    // SECURITY: extract the extension via an allowlist match, not a raw
    // slice from the last dot — an attacker-controlled filename like
    // `a.svg/../../evil` would otherwise smuggle `/`/`..` into the stored
    // key (path traversal on the fs driver, and it defeats the `SAFE_ID`
    // allowlist the GET/DELETE routes rely on).
    const match = part.filename?.match(/\.[A-Za-z0-9]{1,10}$/)
    const ext = match ? match[0] : ''
    const id = `${pygId('file')}${ext}`
    await storage.setItemRaw(id, part.data)
    files.push({ id, url: `/api/admin/uploads/${id}`, filename: part.filename, contentType: part.type ?? null })
  }
  setResponseStatus(event, 201)
  return { files }
})
