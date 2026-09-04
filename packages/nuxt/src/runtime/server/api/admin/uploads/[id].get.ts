import { createError, defineEventHandler, getRouterParam, setResponseHeader } from 'h3'
import { useStorage } from 'nitropack/runtime'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

// Same charset as `pygId` (nanoid, url-safe) plus the dot-extension appended
// by the upload route — never `/`, `\`, `:` segments. Rejecting anything else
// closes path traversal into the unstorage key/fs path. `..` alone passes
// this character class (it's only dots) but a bare `..` segment is still a
// traversal token the fs driver's `join(base, key)` would walk up on — the
// separate `includes('..')` check below closes that.
const SAFE_ID = /^[A-Za-z0-9_.-]+$/

// GET /api/admin/uploads/:id — serves the raw bytes back (no auth: product
// images referencing this url must also be loadable by the storefront/admin
// UI's <img> tags, which cannot attach a session cookie/api-key header).
//
// SECURITY: an uploaded `.svg` can embed a <script> — browsers execute it on
// direct navigation to this URL (same origin as the app -> session cookie
// exposure) even though it never runs inside an <img src> reference. Every
// response gets `X-Content-Type-Options: nosniff` (stops MIME-sniffing a
// non-svg file into svg), and `.svg` responses additionally get a strict CSP
// that disables scripts on direct navigation while leaving the actual pixels
// (as an <img>) unaffected.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  if (!SAFE_ID.test(id) || id.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file id' })
  }
  const data = await useStorage('pygmalion:files').getItemRaw<Buffer>(id)
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }
  const ext = id.includes('.') ? id.slice(id.lastIndexOf('.')) : ''
  setResponseHeader(event, 'content-type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  if (ext === '.svg') {
    setResponseHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
  }
  return data
})
