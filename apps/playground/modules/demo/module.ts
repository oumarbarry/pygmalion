import { addServerHandler, addServerImportsDir, addServerPlugin, createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'

// Local demo module: the worked example of `docs/extending.md`. It exercises the
// five module capabilities: extend the schema, register providers, serve an API
// route, add an admin page, listen to domain events (and seeds data on top).
export default defineNuxtModule({
  meta: { name: 'demo', configKey: 'demo' },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    nuxt.hook('pygmalion:schema', (registry) => {
      registry.add(resolve('./schema'))
    })
    nuxt.hook('pygmalion:providers', (registry) => {
      registry.add(resolve('./providers'))
    })

    // The module's own storefront route, reading the table it added above.
    addServerHandler({
      route: '/api/store/demo-notes',
      method: 'get',
      handler: resolve('./runtime/routes/notes.get'),
    })
    // …and its own admin screen, in the admin shell (`layout: admin`).
    extendPages((pages) => {
      pages.push({ name: 'demo-notes', path: '/admin/notes', file: resolve('./runtime/pages/notes.vue') })
    })

    // capturedEvents accessor for the demo API routes.
    addServerImportsDir(resolve('./runtime/utils'))
    // Registered after @oumarbarry/pygmalion's plugin, so the context is ready:
    // records pygmalion:event and seeds products.
    addServerPlugin(resolve('./runtime/plugin'))
  },
})
