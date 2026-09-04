import {
  addImportsDir,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  addServerTemplate,
  createResolver,
  defineNuxtModule,
  logger,
} from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import {
  createSpecifierRegistry,
  renderCustomerAuthOptionsTemplate,
  renderProvidersTemplate,
  renderSchemaTemplate,
  type SpecifierRegistry,
} from './registry'

export interface ModuleOptions {
  admin: {
    enabled: boolean
    route: string
  }
}

export type { SpecifierRegistry } from './registry'
export type { ProviderDescriptor, ProviderType, PygmalionContext, PygmalionServices } from './runtime/server/types'

declare module '@nuxt/schema' {
  interface NuxtHooks {
    /** Modules add schema specifiers so their Drizzle tables join the composed schema. */
    'pygmalion:schema': (registry: SpecifierRegistry) => void | Promise<void>
    /** Modules add specifiers to files exporting `ProviderDescriptor[]`. */
    'pygmalion:providers': (registry: SpecifierRegistry) => void | Promise<void>
    /** Modules add specifiers to files default-exporting `Partial<BetterAuthOptions>` merged into the `customer` instance (OAuth/2FA/passkeys…). */
    'pygmalion:customer-auth': (registry: SpecifierRegistry) => void | Promise<void>
  }
}

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@oumarbarry/pygmalion',
    configKey: 'pygmalion',
  },
  defaults: {
    admin: {
      enabled: true,
      route: '/admin',
    },
  },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // Runtime config consumed by the Nitro plugin (overridable by the app / env).
    nuxt.options.runtimeConfig.pygmalion = {
      dataDir: '.data/pygmalion',
      drainIntervalMs: 5000,
      // --- Webhooks + notifications -------------------------------------------
      notificationProvider: 'local',
      webhookRetryBaseMs: 5000,
      webhookTimeoutMs: 10_000,
      ...(nuxt.options.runtimeConfig.pygmalion as Record<string, unknown> | undefined),
    }

    // Product images: unstorage key -> bytes, `product_images.url`
    // stores the key. fs driver by default, rooted under the same data dir as
    // PGlite; `memory://` (PGlite's own in-memory sentinel, used by e2e specs)
    // maps to unstorage's `memory` driver instead of a literal `memory://`
    // directory on disk.
    const pygDataDir = (nuxt.options.runtimeConfig.pygmalion as { dataDir: string }).dataDir
    // Cast: `nitro` augments `NuxtOptions` via `nitropack`'s own module
    // declaration, which an isolated `tsc --noEmit` of this package alone
    // (no `nuxt`/`nitropack` config import) does not pick up — the property
    // is real at runtime (Nuxt feeds `nuxt.options.nitro` straight into
    // Nitro's own config).
    const nitroOptions = nuxt.options as unknown as { nitro: { storage?: Record<string, unknown> } }
    nitroOptions.nitro ??= {}
    nitroOptions.nitro.storage ??= {}
    nitroOptions.nitro.storage['pygmalion:files'] ??=
      pygDataDir === 'memory://' ? { driver: 'memory' } : { driver: 'fs', base: `${pygDataDir}/files` }

    // --- Schema + provider composition --------------------------------------
    // Registries seeded with core, extended by modules via hooks at
    // modules:done (so every module's listener is already registered).
    const schemaRegistry = createSpecifierRegistry(['@oumarbarry/pygmalion-core/schema'])
    const providersRegistry = createSpecifierRegistry([])
    // Customer-auth extension point: empty by default; the framework's user
    // adds OAuth/2FA/passkey config for the customer instance from their own
    // module via `nuxt.hook('pygmalion:customer-auth', (r) => r.add(...))`.
    const customerAuthRegistry = createSpecifierRegistry([])
    nuxt.hook('modules:done', async () => {
      await nuxt.callHook('pygmalion:schema', schemaRegistry)
      await nuxt.callHook('pygmalion:providers', providersRegistry)
      await nuxt.callHook('pygmalion:customer-auth', customerAuthRegistry)
    })

    // Nitro virtual modules, imported by the plugin as #pygmalion/schema and
    // #pygmalion/providers. Contents rendered after modules:done populates them.
    addServerTemplate({
      filename: '#pygmalion/schema',
      getContents: () => renderSchemaTemplate(schemaRegistry.specifiers),
    })
    addServerTemplate({
      filename: '#pygmalion/providers',
      getContents: () => renderProvidersTemplate(providersRegistry.specifiers),
    })
    addServerTemplate({
      filename: '#pygmalion/customer-auth-options',
      getContents: () => renderCustomerAuthOptionsTemplate(customerAuthRegistry.specifiers),
    })

    // --- Runtime wiring ------------------------------------------------------
    // Build the context once at boot, expose it, drain the outbox.
    addServerPlugin(resolve('./runtime/server/plugin'))
    // event.context.pygmalion on every request.
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/pygmalion') })
    // staff session OR api-key -> 401 on /api/admin/**. Must run
    // after the pygmalion middleware above (needs event.context.pygmalion.db).
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/admin-auth') })
    // publishable key -> event.context.saleschannels on /api/store/**. Same
    // ordering requirement as admin-auth above.
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/store-channel') })
    // OPTIONAL customer session -> event.context.customer on /api/store/**
    // Never 401s: the storefront is public.
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/customer-auth') })
    // Guest cart cookie -> event.context.cartToken on /api/store/**.
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/cart-token') })
    // usePygmalion() auto-import in server routes/utils/tasks.
    addServerImportsDir(resolve('./runtime/server/utils'))
    // Storefront composables: usePygmalion (SDK client), useCart,
    // useCustomer, useCheckout, auto-imported in pages/components.
    addImportsDir(resolve('./runtime/app/composables'))

    // --- Catalog: products, variants, options, images ------------------------
    // Store: published only, read-only.
    addServerHandler({
      route: '/api/store/products',
      method: 'get',
      handler: resolve('./runtime/server/api/store/products/index.get'),
    })
    addServerHandler({
      route: '/api/store/products/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/store/products/[id].get'),
    })
    // Admin — full CRUD + batch.
    addServerHandler({
      route: '/api/admin/products',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/products/index.get'),
    })
    addServerHandler({
      route: '/api/admin/products',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/index.post'),
    })
    addServerHandler({
      route: '/api/admin/products/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/batch.post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/products/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/products/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/products/[id].delete'),
    })
    // Variants (nested under a product).
    addServerHandler({
      route: '/api/admin/products/:id/variants',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/index.get'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/variants',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/index.post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/variants/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/batch.post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/variants/:variantId',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/[variantId].get'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/variants/:variantId',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/[variantId].post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/variants/:variantId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/[variantId].delete'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/variants/:variantId/images',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/variants/[variantId]/images.post'),
    })
    // Options (an option belongs to exactly one product).
    addServerHandler({
      route: '/api/admin/products/:id/options',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/products/[id]/options/index.get'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/options',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/options/index.post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/options/:optionId',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/options/[optionId].post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/options/:optionId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/products/[id]/options/[optionId].delete'),
    })
    // Images (unstorage-backed, see /api/admin/uploads below).
    addServerHandler({
      route: '/api/admin/products/:id/images',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/products/[id]/images/index.post'),
    })
    addServerHandler({
      route: '/api/admin/products/:id/images/:imageId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/products/[id]/images/[imageId].delete'),
    })
    // Raw file upload/download/delete backing product images.
    addServerHandler({
      route: '/api/admin/uploads',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/uploads/index.post'),
    })
    addServerHandler({
      route: '/api/admin/uploads/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/uploads/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/uploads/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/uploads/[id].delete'),
    })

    // --- Settings: stores, regions, currencies --------------------------------
    addServerHandler({
      route: '/api/admin/stores',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-stores.get'),
    })
    addServerHandler({
      route: '/api/admin/stores/:id',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-store.get'),
    })
    addServerHandler({
      route: '/api/admin/stores/:id',
      method: 'post',
      handler: resolve('./runtime/server/routes/admin-store.post'),
    })
    addServerHandler({
      route: '/api/admin/regions',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-regions.get'),
    })
    addServerHandler({
      route: '/api/admin/regions',
      method: 'post',
      handler: resolve('./runtime/server/routes/admin-regions.post'),
    })
    addServerHandler({
      route: '/api/admin/regions/:id',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-region.get'),
    })
    addServerHandler({
      route: '/api/admin/regions/:id',
      method: 'post',
      handler: resolve('./runtime/server/routes/admin-region.post'),
    })
    addServerHandler({
      route: '/api/admin/regions/:id',
      method: 'delete',
      handler: resolve('./runtime/server/routes/admin-region.delete'),
    })
    addServerHandler({
      route: '/api/admin/currencies',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-currencies.get'),
    })
    addServerHandler({
      route: '/api/admin/currencies/:code',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-currency.get'),
    })

    // --- Staff auth: better-auth instance + invites ---------------------------
    addServerHandler({
      route: '/api/admin/auth/**',
      handler: resolve('./runtime/server/api/admin/auth/handler'),
    })
    addServerHandler({
      route: '/api/admin/auth-bootstrap',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/auth-bootstrap.post'),
    })
    addServerHandler({
      route: '/api/admin/invites',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/invites/index.post'),
    })
    addServerHandler({
      route: '/api/admin/invites',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/invites/index.get'),
    })
    addServerHandler({
      route: '/api/admin/invites/accept',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/invites/accept.post'),
    })
    addServerHandler({
      route: '/api/admin/invites/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/invites/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/users',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/users/index.get'),
    })

    // --- Sales channels + publishable api-keys --------------------------------
    addServerHandler({
      route: '/api/admin/sales-channels',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/sales-channels/index.get'),
    })
    addServerHandler({
      route: '/api/admin/sales-channels',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/sales-channels/index.post'),
    })
    addServerHandler({
      route: '/api/admin/sales-channels/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/sales-channels/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/sales-channels/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/sales-channels/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/sales-channels/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/sales-channels/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/sales-channels/:id/products',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/sales-channels/[id]/products.post'),
    })
    addServerHandler({
      route: '/api/admin/api-keys',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/api-keys/index.get'),
    })
    addServerHandler({
      route: '/api/admin/api-keys',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/api-keys/index.post'),
    })
    addServerHandler({
      route: '/api/admin/api-keys/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/api-keys/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/api-keys/:id/revoke',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/api-keys/[id]/revoke.post'),
    })
    addServerHandler({
      route: '/api/admin/api-keys/:id/sales-channels',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/api-keys/[id]/sales-channels.post'),
    })

    // --- Customers: better-auth instance + groups + addresses -----------------
    addServerHandler({
      route: '/api/auth/**',
      handler: resolve('./runtime/server/api/auth/handler'),
    })
    addServerHandler({
      route: '/api/store/customers/me',
      method: 'get',
      handler: resolve('./runtime/server/routes/store-customer-me.get'),
    })
    addServerHandler({
      route: '/api/store/customers/me',
      method: 'patch',
      handler: resolve('./runtime/server/routes/store-customer-me.patch'),
    })
    addServerHandler({
      route: '/api/store/customers/me/addresses',
      method: 'get',
      handler: resolve('./runtime/server/routes/store-customer-addresses.get'),
    })
    addServerHandler({
      route: '/api/store/customers/me/addresses',
      method: 'post',
      handler: resolve('./runtime/server/routes/store-customer-addresses.post'),
    })
    addServerHandler({
      route: '/api/store/customers/me/addresses/:id',
      method: 'patch',
      handler: resolve('./runtime/server/routes/store-customer-address.patch'),
    })
    addServerHandler({
      route: '/api/store/customers/me/addresses/:id',
      method: 'delete',
      handler: resolve('./runtime/server/routes/store-customer-address.delete'),
    })
    addServerHandler({
      route: '/api/admin/customers',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-customers.get'),
    })
    addServerHandler({
      route: '/api/admin/customers/:id',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-customer.get'),
    })
    addServerHandler({
      route: '/api/admin/customers/:id',
      method: 'patch',
      handler: resolve('./runtime/server/routes/admin-customer.patch'),
    })
    addServerHandler({
      route: '/api/admin/customer-groups',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-customer-groups.get'),
    })
    addServerHandler({
      route: '/api/admin/customer-groups',
      method: 'post',
      handler: resolve('./runtime/server/routes/admin-customer-groups.post'),
    })
    addServerHandler({
      route: '/api/admin/customer-groups/:id',
      method: 'get',
      handler: resolve('./runtime/server/routes/admin-customer-group.get'),
    })
    addServerHandler({
      route: '/api/admin/customer-groups/:id',
      method: 'patch',
      handler: resolve('./runtime/server/routes/admin-customer-group.patch'),
    })
    addServerHandler({
      route: '/api/admin/customer-groups/:id',
      method: 'delete',
      handler: resolve('./runtime/server/routes/admin-customer-group.delete'),
    })
    addServerHandler({
      route: '/api/admin/customer-groups/:id/members',
      method: 'post',
      handler: resolve('./runtime/server/routes/admin-customer-group-members.post'),
    })

    // --- Taxonomy: collections, categories (mpath), tags ----------------------
    addServerHandler({
      route: '/api/admin/collections',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/collections/index.get'),
    })
    addServerHandler({
      route: '/api/admin/collections',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/collections/index.post'),
    })
    addServerHandler({
      route: '/api/admin/collections/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/collections/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/collections/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/collections/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/collections/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/collections/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/collections/:id/products',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/collections/[id]/products.post'),
    })
    addServerHandler({
      route: '/api/admin/product-categories',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/product-categories/index.get'),
    })
    addServerHandler({
      route: '/api/admin/product-categories',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/product-categories/index.post'),
    })
    addServerHandler({
      route: '/api/admin/product-categories/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/product-categories/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/product-categories/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/product-categories/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/product-categories/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/product-categories/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/product-categories/:id/products',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/product-categories/[id]/products.post'),
    })
    addServerHandler({
      route: '/api/admin/product-tags',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/product-tags/index.get'),
    })
    addServerHandler({
      route: '/api/admin/product-tags',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/product-tags/index.post'),
    })
    addServerHandler({
      route: '/api/admin/product-tags/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/product-tags/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/product-tags/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/product-tags/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/product-tags/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/product-tags/[id].delete'),
    })
    addServerHandler({
      route: '/api/store/collections',
      method: 'get',
      handler: resolve('./runtime/server/api/store/collections/index.get'),
    })
    addServerHandler({
      route: '/api/store/collections/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/store/collections/[id].get'),
    })
    addServerHandler({
      route: '/api/store/collections/:id/products',
      method: 'get',
      handler: resolve('./runtime/server/api/store/collections/[id]/products.get'),
    })
    addServerHandler({
      route: '/api/store/product-categories',
      method: 'get',
      handler: resolve('./runtime/server/api/store/product-categories/index.get'),
    })
    addServerHandler({
      route: '/api/store/product-categories/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/store/product-categories/[id].get'),
    })
    addServerHandler({
      route: '/api/store/product-categories/:id/products',
      method: 'get',
      handler: resolve('./runtime/server/api/store/product-categories/[id]/products.get'),
    })
    addServerHandler({
      route: '/api/store/product-tags',
      method: 'get',
      handler: resolve('./runtime/server/api/store/product-tags/index.get'),
    })
    addServerHandler({
      route: '/api/store/product-tags/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/store/product-tags/[id].get'),
    })
    addServerHandler({
      route: '/api/store/product-tags/:id/products',
      method: 'get',
      handler: resolve('./runtime/server/api/store/product-tags/[id]/products.get'),
    })

    // --- Tax: tax-regions, tax-rates (+ rules) --------------------------------
    addServerHandler({
      route: '/api/admin/tax-regions',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/tax-regions/index.get'),
    })
    addServerHandler({
      route: '/api/admin/tax-regions',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/tax-regions/index.post'),
    })
    addServerHandler({
      route: '/api/admin/tax-regions/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/tax-regions/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/tax-regions/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/tax-regions/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/tax-regions/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/tax-regions/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/tax-rates/index.get'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/tax-rates/index.post'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/tax-rates/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/tax-rates/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/tax-rates/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates/:id/rules',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/tax-rates/[id]/rules/index.post'),
    })
    addServerHandler({
      route: '/api/admin/tax-rates/:id/rules/:ruleId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/tax-rates/[id]/rules/[ruleId].delete'),
    })

    // --- Inventory + stock locations -------------------------------------------
    addServerHandler({
      route: '/api/admin/inventory-items',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/inventory-items/index.get'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/inventory-items/index.post'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id/location-levels',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id]/location-levels/index.get'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id/location-levels/:locationId',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id]/location-levels/[locationId].post'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id/location-levels/:locationId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id]/location-levels/[locationId].delete'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id/variants',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id]/variants/index.post'),
    })
    addServerHandler({
      route: '/api/admin/inventory-items/:id/variants/:variantId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/inventory-items/[id]/variants/[variantId].delete'),
    })
    addServerHandler({
      route: '/api/admin/stock-locations',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/stock-locations/index.get'),
    })
    addServerHandler({
      route: '/api/admin/stock-locations',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/stock-locations/index.post'),
    })
    addServerHandler({
      route: '/api/admin/stock-locations/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/stock-locations/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/stock-locations/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/stock-locations/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/stock-locations/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/stock-locations/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/reservations',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/reservations/index.get'),
    })
    addServerHandler({
      route: '/api/admin/reservations',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/reservations/index.post'),
    })
    addServerHandler({
      route: '/api/admin/reservations/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/reservations/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/reservations/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/reservations/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/reservations/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/reservations/[id].delete'),
    })

    // --- Pricing: price lists CRUD + prices batch ---------------------------
    addServerHandler({
      route: '/api/admin/price-lists',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/price-lists/index.get'),
    })
    addServerHandler({
      route: '/api/admin/price-lists',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/price-lists/index.post'),
    })
    addServerHandler({
      route: '/api/admin/price-lists/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/price-lists/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/price-lists/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/price-lists/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/price-lists/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/price-lists/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/price-lists/:id/prices',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/price-lists/[id]/prices.get'),
    })
    addServerHandler({
      route: '/api/admin/price-lists/:id/prices/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/price-lists/[id]/prices/batch.post'),
    })
    addServerHandler({
      route: '/api/admin/price-lists/:id/products',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/price-lists/[id]/products.post'),
    })
    addServerHandler({
      route: '/api/admin/prices/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/prices/batch.post'),
    })
    // --- Catalog cross-links: images, tags, prices, channel products ----------
    addServerHandler({ route: '/api/admin/products/:id/images', method: 'get', handler: resolve('./runtime/server/api/admin/products/[id]/images.get') })
    addServerHandler({ route: '/api/admin/products/:id/variants/:variantId/inventory-items', method: 'get', handler: resolve('./runtime/server/api/admin/products/[id]/variants/[vid]/inventory-items.get') })
    addServerHandler({ route: '/api/admin/product-tags/:id/products', method: 'get', handler: resolve('./runtime/server/api/admin/product-tags/[id]/products.get') })
    addServerHandler({ route: '/api/admin/product-tags/:id/products', method: 'post', handler: resolve('./runtime/server/api/admin/product-tags/[id]/products.post') })
    addServerHandler({ route: '/api/admin/product-variants/:id/prices', method: 'get', handler: resolve('./runtime/server/api/admin/product-variants/[id]/prices.get') })
    addServerHandler({ route: '/api/admin/product-variants/:id/price', method: 'get', handler: resolve('./runtime/server/api/admin/product-variants/[id]/price.get') })
    addServerHandler({ route: '/api/admin/sales-channels/:id/products', method: 'get', handler: resolve('./runtime/server/api/admin/sales-channels/[id]/products.get') })

    // --- Cart: store flow (carts, line items, addresses, shipping) -----------
    addServerHandler({
      route: '/api/store/carts',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/index.post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/store/carts/[id].get'),
    })
    addServerHandler({
      route: '/api/store/carts/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id].post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/line-items',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/line-items/index.post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/line-items/:lineId',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/line-items/[lineId].post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/line-items/:lineId',
      method: 'delete',
      handler: resolve('./runtime/server/api/store/carts/[id]/line-items/[lineId].delete'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/shipping-methods',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/shipping-methods.post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/taxes',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/taxes.post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/customer',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/customer.post'),
    })

    // --- Shipping: fulfillment-sets/service-zones, shipping-profiles, --
    // shipping-options (+ rules), store shipping-options -----------------------
    addServerHandler({
      route: '/api/admin/fulfillment-sets',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/index.get'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/index.post'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id/service-zones',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id]/service-zones.post'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id/service-zones/:zoneId',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id]/service-zones/[zoneId].get'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id/service-zones/:zoneId',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id]/service-zones/[zoneId].post'),
    })
    addServerHandler({
      route: '/api/admin/fulfillment-sets/:id/service-zones/:zoneId',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/fulfillment-sets/[id]/service-zones/[zoneId].delete'),
    })
    addServerHandler({
      route: '/api/admin/shipping-profiles',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/shipping-profiles/index.get'),
    })
    addServerHandler({
      route: '/api/admin/shipping-profiles',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/shipping-profiles/index.post'),
    })
    addServerHandler({
      route: '/api/admin/shipping-profiles/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/shipping-profiles/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/shipping-profiles/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/shipping-profiles/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/shipping-profiles/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/shipping-profiles/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/shipping-profiles/:id/products',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/shipping-profiles/[id]/products.post'),
    })
    addServerHandler({
      route: '/api/admin/shipping-options',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/shipping-options/index.get'),
    })
    addServerHandler({
      route: '/api/admin/shipping-options',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/shipping-options/index.post'),
    })
    addServerHandler({
      route: '/api/admin/shipping-options/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/shipping-options/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/shipping-options/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/shipping-options/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/shipping-options/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/shipping-options/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/shipping-options/:id/rules/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/shipping-options/[id]/rules/batch.post'),
    })
    addServerHandler({
      route: '/api/store/shipping-options',
      method: 'get',
      handler: resolve('./runtime/server/api/store/shipping-options/index.get'),
    })

    // --- Promotions: store cart codes + admin promotions/campaigns -----------
    addServerHandler({
      route: '/api/store/carts/:id/promotions',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/promotions.post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/promotions',
      method: 'delete',
      handler: resolve('./runtime/server/api/store/carts/[id]/promotions.delete'),
    })
    addServerHandler({
      route: '/api/admin/promotions',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/promotions/index.get'),
    })
    addServerHandler({
      route: '/api/admin/promotions',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/promotions/index.post'),
    })
    addServerHandler({
      route: '/api/admin/promotions/rule-attribute-options/:ruleType',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/promotions/rule-attribute-options/[ruleType].get'),
    })
    addServerHandler({
      route: '/api/admin/promotions/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/promotions/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/promotions/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/promotions/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/promotions/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/promotions/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/promotions/:id/rules/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/promotions/[id]/rules/batch.post'),
    })
    addServerHandler({
      route: '/api/admin/promotions/:id/target-rules/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/promotions/[id]/target-rules/batch.post'),
    })
    addServerHandler({
      route: '/api/admin/promotions/:id/buy-rules/batch',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/promotions/[id]/buy-rules/batch.post'),
    })
    addServerHandler({
      route: '/api/admin/campaigns',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/campaigns/index.get'),
    })
    addServerHandler({
      route: '/api/admin/campaigns',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/campaigns/index.post'),
    })
    addServerHandler({
      route: '/api/admin/campaigns/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/campaigns/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/campaigns/:id',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/campaigns/[id].post'),
    })
    addServerHandler({
      route: '/api/admin/campaigns/:id',
      method: 'delete',
      handler: resolve('./runtime/server/api/admin/campaigns/[id].delete'),
    })
    addServerHandler({
      route: '/api/admin/campaigns/:id/promotions',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/campaigns/[id]/promotions.post'),
    })

    // --- Payment + Checkout: store payment-collections + complete, -----------
    // admin order capture/refund/cancel + detail --------------------------------
    addServerHandler({
      route: '/api/store/payment-collections',
      method: 'post',
      handler: resolve('./runtime/server/api/store/payment-collections/index.post'),
    })
    addServerHandler({
      route: '/api/store/carts/:id/complete',
      method: 'post',
      handler: resolve('./runtime/server/api/store/carts/[id]/complete.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/orders/[id].get'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/events',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/orders/[id]/events.get'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/capture',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/capture.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/refund',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/refund.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/cancel',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/cancel.post'),
    })
    // --- Advanced orders: archive + order edits + fulfillments ----------------
    addServerHandler({
      route: '/api/admin/orders/:id/archive',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/archive.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/edits',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/edits/index.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/edits/:editId/preview',
      method: 'get',
      handler: resolve('./runtime/server/api/admin/orders/[id]/edits/[editId]/preview.get'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/edits/:editId/confirm',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/edits/[editId]/confirm.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/edits/:editId/cancel',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/edits/[editId]/cancel.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/fulfillments',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/fulfillments/index.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/fulfillments/:fid/shipments',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/fulfillments/[fid]/shipments.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/fulfillments/:fid/mark-as-delivered',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/fulfillments/[fid]/mark-as-delivered.post'),
    })
    addServerHandler({
      route: '/api/admin/orders/:id/fulfillments/:fid/cancel',
      method: 'post',
      handler: resolve('./runtime/server/api/admin/orders/[id]/fulfillments/[fid]/cancel.post'),
    })
    // --- Advanced orders: returns, exchanges, claims, drafts + lists ----------
    addServerHandler({ route: '/api/admin/orders', method: 'get', handler: resolve('./runtime/server/api/admin/orders/index.get') })
    // Return reasons (CRUD referential).
    addServerHandler({ route: '/api/admin/return-reasons', method: 'get', handler: resolve('./runtime/server/api/admin/return-reasons/index.get') })
    addServerHandler({ route: '/api/admin/return-reasons', method: 'post', handler: resolve('./runtime/server/api/admin/return-reasons/index.post') })
    addServerHandler({ route: '/api/admin/return-reasons/:id', method: 'get', handler: resolve('./runtime/server/api/admin/return-reasons/[id].get') })
    addServerHandler({ route: '/api/admin/return-reasons/:id', method: 'post', handler: resolve('./runtime/server/api/admin/return-reasons/[id].post') })
    addServerHandler({ route: '/api/admin/return-reasons/:id', method: 'delete', handler: resolve('./runtime/server/api/admin/return-reasons/[id].delete') })
    // Returns.
    addServerHandler({ route: '/api/admin/returns', method: 'get', handler: resolve('./runtime/server/api/admin/returns/index.get') })
    addServerHandler({ route: '/api/admin/returns', method: 'post', handler: resolve('./runtime/server/api/admin/returns/index.post') })
    addServerHandler({ route: '/api/admin/returns/:id', method: 'get', handler: resolve('./runtime/server/api/admin/returns/[id].get') })
    addServerHandler({ route: '/api/admin/returns/:id/receive', method: 'post', handler: resolve('./runtime/server/api/admin/returns/[id]/receive.post') })
    addServerHandler({ route: '/api/admin/returns/:id/cancel', method: 'post', handler: resolve('./runtime/server/api/admin/returns/[id]/cancel.post') })
    // Exchanges.
    addServerHandler({ route: '/api/admin/exchanges', method: 'get', handler: resolve('./runtime/server/api/admin/exchanges/index.get') })
    addServerHandler({ route: '/api/admin/exchanges', method: 'post', handler: resolve('./runtime/server/api/admin/exchanges/index.post') })
    addServerHandler({ route: '/api/admin/exchanges/:id', method: 'get', handler: resolve('./runtime/server/api/admin/exchanges/[id].get') })
    addServerHandler({ route: '/api/admin/exchanges/:id/complete', method: 'post', handler: resolve('./runtime/server/api/admin/exchanges/[id]/complete.post') })
    addServerHandler({ route: '/api/admin/exchanges/:id/cancel', method: 'post', handler: resolve('./runtime/server/api/admin/exchanges/[id]/cancel.post') })
    // Claims.
    addServerHandler({ route: '/api/admin/claims', method: 'get', handler: resolve('./runtime/server/api/admin/claims/index.get') })
    addServerHandler({ route: '/api/admin/claims', method: 'post', handler: resolve('./runtime/server/api/admin/claims/index.post') })
    addServerHandler({ route: '/api/admin/claims/:id', method: 'get', handler: resolve('./runtime/server/api/admin/claims/[id].get') })
    addServerHandler({ route: '/api/admin/claims/:id/complete', method: 'post', handler: resolve('./runtime/server/api/admin/claims/[id]/complete.post') })
    addServerHandler({ route: '/api/admin/claims/:id/cancel', method: 'post', handler: resolve('./runtime/server/api/admin/claims/[id]/cancel.post') })
    // Draft orders.
    addServerHandler({ route: '/api/admin/draft-orders', method: 'get', handler: resolve('./runtime/server/api/admin/draft-orders/index.get') })
    addServerHandler({ route: '/api/admin/draft-orders', method: 'post', handler: resolve('./runtime/server/api/admin/draft-orders/index.post') })
    addServerHandler({ route: '/api/admin/draft-orders/:id', method: 'get', handler: resolve('./runtime/server/api/admin/draft-orders/[id].get') })
    addServerHandler({ route: '/api/admin/draft-orders/:id/convert-to-order', method: 'post', handler: resolve('./runtime/server/api/admin/draft-orders/[id]/convert-to-order.post') })
    addServerHandler({ route: '/api/admin/draft-orders/:id/cancel', method: 'post', handler: resolve('./runtime/server/api/admin/draft-orders/[id]/cancel.post') })
    // Store: customer's orders (drafts excluded).
    addServerHandler({ route: '/api/store/orders', method: 'get', handler: resolve('./runtime/server/api/store/orders/index.get') })
    addServerHandler({ route: '/api/store/orders/:id', method: 'get', handler: resolve('./runtime/server/api/store/orders/[id].get') })

    // --- Webhooks + notifications ----------------------------------------------
    // The signing secret is returned by create + rotate-secret only; every other
    // read masks it.
    addServerHandler({ route: '/api/admin/webhook-endpoints', method: 'get', handler: resolve('./runtime/server/api/admin/webhook-endpoints/index.get') })
    addServerHandler({ route: '/api/admin/webhook-endpoints', method: 'post', handler: resolve('./runtime/server/api/admin/webhook-endpoints/index.post') })
    addServerHandler({ route: '/api/admin/webhook-endpoints/:id', method: 'get', handler: resolve('./runtime/server/api/admin/webhook-endpoints/[id].get') })
    addServerHandler({ route: '/api/admin/webhook-endpoints/:id', method: 'post', handler: resolve('./runtime/server/api/admin/webhook-endpoints/[id].post') })
    addServerHandler({ route: '/api/admin/webhook-endpoints/:id', method: 'delete', handler: resolve('./runtime/server/api/admin/webhook-endpoints/[id].delete') })
    addServerHandler({ route: '/api/admin/webhook-endpoints/:id/rotate-secret', method: 'post', handler: resolve('./runtime/server/api/admin/webhook-endpoints/[id]/rotate-secret.post') })
    addServerHandler({ route: '/api/admin/webhook-deliveries', method: 'get', handler: resolve('./runtime/server/api/admin/webhook-deliveries/index.get') })
    addServerHandler({ route: '/api/admin/webhook-deliveries/:id/redeliver', method: 'post', handler: resolve('./runtime/server/api/admin/webhook-deliveries/[id]/redeliver.post') })
    addServerHandler({ route: '/api/admin/notifications', method: 'get', handler: resolve('./runtime/server/api/admin/notifications/index.get') })
    // --- Remaining surface: providers, payments, referentials, customers ------
    // Provider registries (introspection of the pygmalion:providers hook).
    addServerHandler({ route: '/api/admin/tax-providers', method: 'get', handler: resolve('./runtime/server/api/admin/tax-providers/index.get') })
    addServerHandler({ route: '/api/admin/fulfillment-providers', method: 'get', handler: resolve('./runtime/server/api/admin/fulfillment-providers/index.get') })
    addServerHandler({ route: '/api/admin/payments/payment-providers', method: 'get', handler: resolve('./runtime/server/api/admin/payments/payment-providers.get') })
    addServerHandler({ route: '/api/store/payment-providers', method: 'get', handler: resolve('./runtime/server/api/store/payment-providers/index.get') })
    // Payments + additional payment collections: an order edit that raises the
    // total, or a positive exchange_difference, opens an extra collection that
    // gets paid here.
    addServerHandler({ route: '/api/admin/payment-collections', method: 'post', handler: resolve('./runtime/server/api/admin/payment-collections/index.post') })
    addServerHandler({ route: '/api/admin/payment-collections/:id/payment-sessions', method: 'post', handler: resolve('./runtime/server/api/admin/payment-collections/[id]/payment-sessions.post') })
    addServerHandler({ route: '/api/admin/payment-collections/:id/mark-as-paid', method: 'post', handler: resolve('./runtime/server/api/admin/payment-collections/[id]/mark-as-paid.post') })
    addServerHandler({ route: '/api/admin/payments', method: 'get', handler: resolve('./runtime/server/api/admin/payments/index.get') })
    addServerHandler({ route: '/api/admin/payments/:id', method: 'get', handler: resolve('./runtime/server/api/admin/payments/[id].get') })
    addServerHandler({ route: '/api/admin/payments/:id/capture', method: 'post', handler: resolve('./runtime/server/api/admin/payments/[id]/capture.post') })
    addServerHandler({ route: '/api/admin/payments/:id/refund', method: 'post', handler: resolve('./runtime/server/api/admin/payments/[id]/refund.post') })
    // Refund reasons (referential behind the refunds.refund_reason_id FK).
    addServerHandler({ route: '/api/admin/refund-reasons', method: 'get', handler: resolve('./runtime/server/api/admin/refund-reasons/index.get') })
    addServerHandler({ route: '/api/admin/refund-reasons', method: 'post', handler: resolve('./runtime/server/api/admin/refund-reasons/index.post') })
    addServerHandler({ route: '/api/admin/refund-reasons/:id', method: 'get', handler: resolve('./runtime/server/api/admin/refund-reasons/[id].get') })
    addServerHandler({ route: '/api/admin/refund-reasons/:id', method: 'post', handler: resolve('./runtime/server/api/admin/refund-reasons/[id].post') })
    addServerHandler({ route: '/api/admin/refund-reasons/:id', method: 'delete', handler: resolve('./runtime/server/api/admin/refund-reasons/[id].delete') })
    // Price preferences.
    addServerHandler({ route: '/api/admin/price-preferences', method: 'get', handler: resolve('./runtime/server/api/admin/price-preferences/index.get') })
    addServerHandler({ route: '/api/admin/price-preferences', method: 'post', handler: resolve('./runtime/server/api/admin/price-preferences/index.post') })
    addServerHandler({ route: '/api/admin/price-preferences/:id', method: 'get', handler: resolve('./runtime/server/api/admin/price-preferences/[id].get') })
    addServerHandler({ route: '/api/admin/price-preferences/:id', method: 'post', handler: resolve('./runtime/server/api/admin/price-preferences/[id].post') })
    addServerHandler({ route: '/api/admin/price-preferences/:id', method: 'delete', handler: resolve('./runtime/server/api/admin/price-preferences/[id].delete') })
    // Customers: manual creation, addresses, groups (customer side).
    addServerHandler({ route: '/api/admin/customers', method: 'post', handler: resolve('./runtime/server/routes/admin-customers.post') })
    addServerHandler({ route: '/api/admin/customers/:id/addresses', method: 'get', handler: resolve('./runtime/server/routes/admin-customer-addresses.get') })
    addServerHandler({ route: '/api/admin/customers/:id/addresses', method: 'post', handler: resolve('./runtime/server/routes/admin-customer-addresses.post') })
    addServerHandler({ route: '/api/admin/customers/:id/addresses/:addressId', method: 'get', handler: resolve('./runtime/server/routes/admin-customer-address.get') })
    addServerHandler({ route: '/api/admin/customers/:id/addresses/:addressId', method: 'patch', handler: resolve('./runtime/server/routes/admin-customer-address.patch') })
    addServerHandler({ route: '/api/admin/customers/:id/addresses/:addressId', method: 'delete', handler: resolve('./runtime/server/routes/admin-customer-address.delete') })
    addServerHandler({ route: '/api/admin/customers/:id/customer-groups', method: 'get', handler: resolve('./runtime/server/routes/admin-customer-groups-of.get') })
    addServerHandler({ route: '/api/admin/customers/:id/customer-groups', method: 'post', handler: resolve('./runtime/server/routes/admin-customer-groups-of.post') })
    // Staff: current profile + invite detail.
    addServerHandler({ route: '/api/admin/users/me', method: 'get', handler: resolve('./runtime/server/api/admin/users/me.get') })
    addServerHandler({ route: '/api/admin/invites/:id', method: 'get', handler: resolve('./runtime/server/api/admin/invites/[id].get') })
    // Store: referentials readable by the storefront + payment session.
    addServerHandler({ route: '/api/store/regions', method: 'get', handler: resolve('./runtime/server/api/store/regions/index.get') })
    addServerHandler({ route: '/api/store/regions/:id', method: 'get', handler: resolve('./runtime/server/api/store/regions/[id].get') })
    addServerHandler({ route: '/api/store/currencies', method: 'get', handler: resolve('./runtime/server/api/store/currencies/index.get') })
    addServerHandler({ route: '/api/store/currencies/:code', method: 'get', handler: resolve('./runtime/server/api/store/currencies/[code].get') })
    addServerHandler({ route: '/api/store/return-reasons', method: 'get', handler: resolve('./runtime/server/api/store/return-reasons/index.get') })
    addServerHandler({ route: '/api/store/return-reasons/:id', method: 'get', handler: resolve('./runtime/server/api/store/return-reasons/[id].get') })
    addServerHandler({ route: '/api/store/payment-collections/:id/payment-sessions', method: 'post', handler: resolve('./runtime/server/api/store/payment-collections/[id]/payment-sessions.post') })
    addServerHandler({ route: '/api/store/customers/me/addresses/:id', method: 'get', handler: resolve('./runtime/server/routes/store-customer-address.get') })
    addServerHandler({ route: '/api/store/product-variants', method: 'get', handler: resolve('./runtime/server/api/store/product-variants/index.get') })
    addServerHandler({ route: '/api/store/returns', method: 'post', handler: resolve('./runtime/server/api/store/returns/index.post') })

    logger.info('@oumarbarry/pygmalion installed')
  },
})

export default module
