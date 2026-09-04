import { createError, defineEventHandler } from 'h3'
import { staffAuth, staffRoles, type StaffRole } from '../utils/auth'

// Guards every `/api/admin/**` route: a staff session OR a valid api-key,
// else 401. Carve-outs stay public: better-auth's own routes
// (`/api/admin/auth/**`, sign-in itself can't require a session), the
// invite-accept endpoint (token-authenticated, not session-authenticated),
// and reading an uploaded file (`product_images.url` points
// here and must be loadable by a plain `<img>` tag, storefront or admin,
// with no cookie/api-key attached; only the write side, POST/DELETE, stays
// staff-gated inside the route itself via `requirePermission`).
// `staffAuth().api.getSession` resolves either a cookie session or an
// `x-api-key` header in one call (api-key plugin's `enableSessionForAPIKeys`).
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]
  if (!path.startsWith('/api/admin/')) return
  if (path.startsWith('/api/admin/auth/')) return
  if (path === '/api/admin/auth-bootstrap') return // zero-staff guard inside
  if (path === '/api/admin/invites/accept') return
  if (event.method === 'GET' && path.startsWith('/api/admin/uploads/')) return

  const session = await staffAuth().api.getSession({ headers: event.headers })
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  // A session is not enough: the user must carry a role from our matrix.
  // (Defense in depth — an out-of-matrix role must never pass as staff.)
  const role = (session.user as { role?: string }).role
  if (!role || !(role in staffRoles)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  event.context.staff = {
    user: { id: session.user.id, email: session.user.email },
    role: role as StaffRole,
  }
})
