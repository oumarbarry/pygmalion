import { defineEventHandler, toWebRequest } from 'h3'
import { staffAuth } from '../../../utils/auth'

// Catch-all for the staff better-auth instance (sign-in, sign-out,
// get-session, api-key/*, admin/* …) mounted at `/api/admin/auth/**`.
// Public by design — better-auth enforces auth per-endpoint itself.
export default defineEventHandler((event) => staffAuth().handler(toWebRequest(event)))
