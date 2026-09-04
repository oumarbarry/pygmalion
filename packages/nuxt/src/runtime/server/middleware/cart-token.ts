import { defineEventHandler, getCookie } from 'h3'
import { CART_TOKEN_COOKIE } from '../utils/cart'

// Resolves the guest cart cookie on `/api/store/**` into `event.context.cartToken`.
// No DB lookup here; deliberately as light as `store-channel.ts`'s
// header read: most `/api/store/**` requests aren't cart routes, so this
// middleware just makes the raw token available; `requireCartAccess`
// (`utils/cart.ts`) does the one query that actually needs it, only on the
// routes that touch a cart.
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]
  if (!path.startsWith('/api/store/')) return
  event.context.cartToken = getCookie(event, CART_TOKEN_COOKIE)
})

declare module 'h3' {
  interface H3EventContext {
    /** Set by this middleware — the opaque cart cookie value, if present (never a DB lookup by itself). */
    cartToken?: string
  }
}
