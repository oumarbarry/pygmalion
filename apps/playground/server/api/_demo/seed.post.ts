import type { DemoLocale } from '../../../modules/demo/runtime/catalog'
import { seedDemoStore } from '../../../modules/demo/runtime/seed'

// TEST-ONLY (like the rest of `_demo/*` and `_test/*`): runs the demo seed on
// demand. `pnpm dev` seeds itself at boot; a production E2E build does not, so
// the shopping journey suite calls this once and then shops against the same
// catalogue a developer sees. Idempotent — calling it twice changes nothing.
// Body: `{ locale?: 'en' | 'fr' }`, optional; the seed's default otherwise.
// Never shipped in `@oumarbarry/pygmalion` — playground-only.
export default defineEventHandler(async (event) => {
  const { services } = usePygmalion()
  const body = await readBody<{ locale?: unknown } | null>(event)
  const locale: DemoLocale | undefined = body?.locale === 'en' || body?.locale === 'fr' ? body.locale : undefined
  return await seedDemoStore(services, { locale })
})
