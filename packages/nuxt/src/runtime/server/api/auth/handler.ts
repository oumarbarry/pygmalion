import { defineEventHandler, toWebRequest } from 'h3'
import { customerAuth } from '../../utils/customer-auth'

// Catch-all for the customer better-auth instance (sign-up, sign-in,
// sign-out, get-session, …) mounted at `/api/auth/**`. Public by
// design: better-auth enforces auth per-endpoint itself, and unlike staff,
// customer sign-up is intentionally open (this is the storefront).
export default defineEventHandler((event) => customerAuth().handler(toWebRequest(event)))
