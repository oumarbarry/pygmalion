/**
 * Cart access control. Cart identity is deliberately split in two
 * (`schema/cart.ts` header): the `id` used in URLs, and an opaque cookie
 * `token` that actually authorizes writes. `requireCartAccess` is the one
 * check every `/api/store/carts/:id/**` route runs before touching a cart —
 * mirrors `requireCustomer` (`utils/customer-auth.ts`).
 */
import { createError, setCookie, type H3Event } from 'h3'

export const CART_TOKEN_COOKIE = 'pygmalion_cart_token'

/** Set right after `POST /store/carts` creates a cart — the storefront never generates this itself. */
export function setCartTokenCookie(event: H3Event, token: string): void {
  setCookie(event, CART_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // ~1 year — long-lived like most storefront cart cookies; a completed
    // cart or an old abandoned one just stops being read past that.
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * 404s unless this request may touch `cart`: the owning customer's session
 * (`event.context.customer`, set by `middleware/customer-auth.ts`) for a
 * transferred cart, or — for a still-guest cart — the cookie token
 * (`event.context.cartToken`, `middleware/cart-token.ts`) matching
 * `cart.token`. 404, not 403, on purpose: knowing a cart id must not be
 * enough to learn whether it exists.
 */
export function requireCartAccess(event: H3Event, cart: { token: string; customerId: string | null }): void {
  const authorized = cart.customerId
    ? event.context.customer?.id === cart.customerId
    : Boolean(event.context.cartToken) && event.context.cartToken === cart.token
  if (!authorized) {
    throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  }
}
