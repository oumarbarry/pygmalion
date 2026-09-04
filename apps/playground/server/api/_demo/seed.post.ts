import { seedDemoStore } from '../../../modules/demo/runtime/seed'

// TEST-ONLY (like the rest of `_demo/*` and `_test/*`): runs the demo seed on
// demand. `pnpm dev` seeds itself at boot; a production E2E build does not, so
// the shopping journey suite calls this once and then shops against the same
// catalogue a developer sees. Idempotent — calling it twice changes nothing.
// Never shipped in `@oumarbarry/pygmalion` — playground-only.
export default defineEventHandler(async () => {
  const { services } = usePygmalion()
  return await seedDemoStore(services)
})
