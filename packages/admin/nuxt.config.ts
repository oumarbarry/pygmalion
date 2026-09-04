// @oumarbarry/pygmalion-admin: Nuxt layer mounted on /admin. Consumed by the host app via
// `extends: ['@oumarbarry/pygmalion-admin']` (see apps/playground/nuxt.config.ts).
// Pages live under app/pages/admin/** so the layer resolves at /admin/**
// once merged — no change to @oumarbarry/pygmalion (server module) required.
import { createResolver } from '@nuxt/kit'

// A `~/`-prefixed css path resolves against the EXTENDING app's
// srcDir, not this layer's (a documented Nuxt layers gotcha). Resolve to an
// absolute path instead so it works regardless of what extends this layer.
const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  compatibilityDate: 'latest',
  modules: ['@nuxt/ui'],
  css: [resolve('./app/assets/css/main.css')],
  ui: {
    theme: {
      // Nuxt UI v4 in unstyled mode (Reka UI primitives): strips Nuxt UI's
      // default Tailwind theme entirely (structure + cosmetics). Pygmalion
      // supplies its own base classes for every slot via app.config.ts, built
      // on top of Reka UI's accessible, unstyled component behaviour.
      unstyled: true,
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'],
    },
  },
  // Host apps decide ssr for /admin/** (see apps/playground/nuxt.config.ts).
  // Declared here too so the layer stays correct if extended without that rule.
  routeRules: {
    '/admin/**': { ssr: false },
  },
})
