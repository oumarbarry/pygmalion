import { defineEventHandler } from 'h3'
import { customerAuth } from '../utils/customer-auth'

// Resolves an OPTIONAL customer session on `/api/store/**`: the
// storefront is public, so a missing or invalid session cookie is never a
// 401 here — routes that require a signed-in customer check
// `event.context.customer` themselves and 401 explicitly (see
// `routes/store-customer-me.get.ts`).
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]
  if (!path.startsWith('/api/store/')) return

  const session = await customerAuth().api.getSession({ headers: event.headers }).catch(() => null)
  if (session) {
    event.context.customer = { id: session.user.id, email: session.user.email }
  }
})
