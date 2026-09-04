// `pnpm dev` opens on a real shop. Payments run on the built-in `manual`
// provider — zero configuration — and Stripe joins the checkout the moment a
// secret key is on the environment. Nothing to uncomment, nothing to install.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? ''

export default defineNuxtConfig({
  compatibilityDate: 'latest',
  // @oumarbarry/pygmalion-admin is a Nuxt layer mounted on /admin (its own pages
  // live under app/pages/admin/**) — extended here since the module
  // (packages/nuxt) doesn't do layer wiring itself.
  extends: ['@oumarbarry/pygmalion-admin'],
  // demo is local (apps/playground/modules/demo) and loads after @oumarbarry/pygmalion
  // so its schema/provider hooks and seed run in the right order.
  modules: [
    '@oumarbarry/pygmalion',
    // The provider registry is what the checkout reads (`GET
    // /api/store/payment-providers`), so an absent module simply means the
    // payment step offers one method instead of two — no branch in the UI.
    ...(stripeSecretKey ? ['@oumarbarry/pygmalion-stripe' as const] : []),
    './modules/demo/module',
  ],
  // The storefront skin. Tailwind + @nuxt/ui themselves come from the admin
  // layer's main.css (unstyled mode); this only adds the shop's own voice.
  css: ['~/assets/css/storefront.css'],
  devServer: { port: 3648 },
  runtimeConfig: {
    pygmalion: {
      // Drain the outbox quickly in dev so events surface fast.
      drainIntervalMs: 1000,
    },
    // The module reads `runtimeConfig.stripe` (NUXT_STRIPE_* by convention);
    // mapped from the plainer names a shop owner is told to set.
    stripe: {
      secretKey: stripeSecretKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      // Authorize at checkout, capture at shipment (the recommended mode).
      captureMethod: 'manual',
    },
  },
  routeRules: {
    '/admin/**': { ssr: false },
  },
})
