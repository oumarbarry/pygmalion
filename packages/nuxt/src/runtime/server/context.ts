import type { PygmalionContext } from './types'

// Boot-time singleton. The Nitro plugin builds the context once and stores it
// here; `usePygmalion()` and request middleware read it back.
let context: PygmalionContext | undefined

// Nitro runs plugins via a bare `for (const plugin of plugins) plugin(nitroApp)`
// loop — it does NOT await each one before starting the next (see
// nitropack/dist/runtime/internal/app.mjs `runNitroPlugins`). A module plugin
// registered after ours can start executing before our async setup (db connect
// + schema push) resolves. `waitForPygmalionContext` gives such plugins a
// reliable way to wait for boot instead of racing `getPygmalionContext()`.
let resolveReady!: (ctx: PygmalionContext) => void
const ready = new Promise<PygmalionContext>((resolve) => {
  resolveReady = resolve
})

export function setPygmalionContext(ctx: PygmalionContext): void {
  context = ctx
  resolveReady(ctx)
}

export function getPygmalionContext(): PygmalionContext {
  if (!context) {
    throw new Error('pygmalion: context not initialised (Nitro plugin has not run)')
  }
  return context
}

export function waitForPygmalionContext(): Promise<PygmalionContext> {
  return context ? Promise.resolve(context) : ready
}
