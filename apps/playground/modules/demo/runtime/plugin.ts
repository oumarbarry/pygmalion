import { demoLocale, seedDemoStore } from './seed'
import { seedDevStaff } from './staff'

// Nitro plugin (auto-imports: defineNitroPlugin, waitForPygmalionContext,
// capturedEvents). Registered after @oumarbarry/pygmalion's plugin, but Nitro does
// NOT await plugins sequentially (see context.ts) — this one can start before
// that one finishes, so it must wait for context readiness explicitly rather
// than call `usePygmalion()` directly.
export default defineNitroPlugin(async (nitroApp) => {
  // Capture domain events for the E2E to assert on.
  nitroApp.hooks.hook('pygmalion:event', (e) => {
    capturedEvents.push(e)
  })

  // Seed a couple of products if the store is empty.
  //
  // `draft` in dev: these two carry no photo and no price, and the demo seed
  // below fills the same store a few lines later — published, they showed up as
  // two broken cards at the end of the shop window (`pnpm dev` opens on a
  // full shop). Draft keeps them out of the storefront while leaving the boot
  // sequence exactly as it was. E2E suites build for production, so their
  // fixture is unchanged.
  const { services } = await waitForPygmalionContext()
  const existing = await services.products.list({ limit: 1 })
  if (existing.length === 0) {
    const status = import.meta.dev ? 'draft' : 'published'
    await services.products.create({ title: 'Seed Mug', handle: 'seed-mug', status })
    await services.products.create({ title: 'Seed Plate', handle: 'seed-plate', status })
  }

  // `pnpm dev` opens on a full shop, never on an empty admin.
  //
  // DEV ONLY. E2E suites build for production, so this stays off there and a
  // suite keeps the empty store its own fixtures assume; the shopping
  // journeys ask for the demo data explicitly via `POST /api/_demo/seed`.
  if (import.meta.dev) {
    const result = await seedDemoStore(services, { locale: demoLocale() })
    const staff = await seedDevStaff()
    console.log(
      `[demo] shop ready: ${result.products} products, ${result.collections} collections, `
      + `${result.regions} regions, ${result.shippingOptions} shipping options, ${result.promotions} promotions`,
    )
    console.log(`[demo] admin: ${staff.email} / ${staff.password} at /admin`)
  }
})
