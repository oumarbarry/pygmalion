import { defineEventHandler } from 'h3'
import { waitForPygmalionContext } from '../context'

// Expose the runtime context on every request: `event.context.pygmalion`.
// Awaits readiness rather than reading the context synchronously: a request
// can land before the boot plugin's async setup resolves (e.g. a warmup
// probe), and Nitro doesn't serialise plugin/request ordering for us (see
// context.ts).
export default defineEventHandler(async (event) => {
  event.context.pygmalion = await waitForPygmalionContext()
})
