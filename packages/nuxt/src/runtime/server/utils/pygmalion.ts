import { getPygmalionContext, waitForPygmalionContext } from '../context'
import type { PygmalionContext } from '../types'

/**
 * Server-side access to the Pygmalion runtime context (DB, services,
 * providers, events) with no HTTP hop. Auto-imported in Nitro server
 * routes, utils, and tasks. Request handlers run after boot, so this is safe;
 * for code that may run *during* Nitro plugin boot (e.g. a module's own
 * server plugin seeding data), use `waitForPygmalionContext` instead — plugin
 * execution order is not a reliable readiness signal (see context.ts).
 */
export function usePygmalion(): PygmalionContext {
  return getPygmalionContext()
}

export { waitForPygmalionContext }
