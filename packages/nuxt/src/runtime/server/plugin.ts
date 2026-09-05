import {
  createCategoriesService,
  // --- Cart --------------------------------------------------------------------
  createCartService,
  createCollectionsService,
  createCurrenciesService,
  createCustomerGroupsService,
  createCustomersService,
  createInventoryService,
  createPricePreferencesService,
  createPricingService,
  createProductsService,
  // --- Promotions ---------------------------------------------------------------
  createPromotionsService,
  createRegionsService,
  createSalesChannelsService,
  // --- Shipping ----------------------------------------------------------------
  createManualFulfillmentProvider,
  // --- Payment + Checkout ------------------------------------------------------
  createManualPaymentProvider,
  createPaymentService,
  createCheckoutService,
  createOrderEditsService,
  createFulfillmentsService,
  // --- RMA + draft orders -----------------------------------------------------
  createReturnsService,
  createExchangesService,
  createClaimsService,
  createDraftOrdersService,
  createShippingService,
  createStoresService,
  createTagsService,
  // --- Webhooks + notifications -------------------------------------------------
  createWebhooksService,
  createNotificationsService,
  createLocalNotificationProvider,
  enqueueWebhookDeliveries,
  enqueueEventNotifications,
  deliverDueWebhooks,
  flushNotifications,
  drainOutbox,
  pushDbSchema,
  // --- Tax --------------------------------------------------------------------
  createSystemTaxProvider,
  createTaxRatesService,
  createTaxRegionsService,
  createTaxService,
} from '@oumarbarry/pygmalion-core'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
// Virtual modules composed at build time (aliased in module.ts).
import { schema } from '#pygmalion/schema'
import { providerDescriptors } from '#pygmalion/providers'
import { setPygmalionContext } from './context'
import { createDatabase } from './db'
import { createProviderRegistry } from './providers'
import type { NotificationProvider, PygmalionDatabase } from '@oumarbarry/pygmalion-core'
import type { PygmalionConfig, PygmalionContext, ProviderDescriptor } from './types'

export default defineNitroPlugin(async (nitroApp) => {
  const rc = (useRuntimeConfig().pygmalion ?? {}) as Partial<PygmalionConfig>
  const databaseUrl = process.env.DATABASE_URL || rc.databaseUrl || undefined
  const config: PygmalionConfig = {
    databaseUrl,
    dataDir: rc.dataDir ?? '.data/pygmalion',
    drainIntervalMs: rc.drainIntervalMs ?? 5000,
    // Dev (PGlite) auto-pushes the composed schema at boot. Prod migrates via
    // the CLI, so auto-push defaults off when DATABASE_URL is set.
    autoPush: rc.autoPush ?? !databaseUrl,
    notificationProvider: rc.notificationProvider ?? 'local',
    webhookRetryBaseMs: rc.webhookRetryBaseMs ?? 5000,
    webhookTimeoutMs: rc.webhookTimeoutMs ?? 10_000,
  }

  const { db, dispose } = await createDatabase(config)
  if (config.autoPush) {
    await pushDbSchema(db, schema)
  }

  // Drain dispatches each event to `pygmalion:event` handlers and queues the
  // rows its two consumers (webhooks, notifications) derive from it. `tx` is the
  // drain transaction: everything here is DB-only; the webhook HTTP call and the
  // notification provider call happen after the commit, in `drain()` below.
  const dispatch = async (event: string, payload: unknown, tx: PygmalionDatabase) => {
    await enqueueWebhookDeliveries(tx, event, payload)
    await enqueueEventNotifications(tx, event, payload)
    await nitroApp.hooks.callHook('pygmalion:event', { event, payload })
  }

  // eslint-disable-next-line prefer-const
  let ctx: PygmalionContext
  // --- Tax: default DB-backed `system` provider, always registered, ahead of
  // any third-party `pygmalion:providers` descriptor (the equivalent of
  // Medusa's `tp_system`). A module can still shadow it by
  // registering its own provider under a different id and pointing a tax
  // region's `provider_id` at that id instead.
  // --- Shipping: default `manual` provider (Medusa parity), same "always
  // registered ahead of third-party descriptors" precedent as
  // tax's `system` provider above.
  // --- Payment: default DB-backed `manual` provider (dev + pay-on-delivery),
  // authorizes/captures with no external call, same precedent.
  const defaultProviderDescriptors: ProviderDescriptor[] = [
    { type: 'tax', id: 'system', factory: () => createSystemTaxProvider() },
    { type: 'fulfillment', id: 'manual', factory: () => createManualFulfillmentProvider() },
    { type: 'payment', id: 'manual', factory: () => createManualPaymentProvider() },
    // --- Notifications: default DB-backed `local` provider, no transport,
    // the `notifications` row IS the delivery. Swap with
    // `pygmalion.notificationProvider` once a module registers a real one.
    { type: 'notification', id: 'local', factory: () => createLocalNotificationProvider() },
  ]
  const providers = createProviderRegistry([...defaultProviderDescriptors, ...providerDescriptors], () => ctx)
  const currencies = createCurrenciesService({ db })
  const regions = createRegionsService({ db })
  const stores = createStoresService({ db })
  const salesChannels = createSalesChannelsService({ db })
  const pricing = createPricingService({ db })
  const shipping = createShippingService({ db, pricing, providers })
  // Hoisted so checkout can reference the same cart instance (it needs
  // `recalcTaxes` to revalidate before TX1).
  const cart = createCartService({ db, pricing, providers, shipping })
  ctx = {
    db,
    config,
    providers,
    // One pass = drain (tx: state -> delivery/notification rows) THEN the
    // external calls, strictly after that commit. Neither side-effect pass
    // may throw into the caller: a dead subscriber must not stall the drain.
    events: {
      drain: async () => {
        const result = await drainOutbox(db, dispatch)
        await deliverDueWebhooks(db, { retryBaseMs: config.webhookRetryBaseMs, timeoutMs: config.webhookTimeoutMs })
        await flushNotifications(db, providers.get<NotificationProvider>('notification', config.notificationProvider))
        return result
      },
    },
    services: {
      products: createProductsService({ db }),
      stores,
      regions,
      currencies,
      pricePreferences: createPricePreferencesService({ db }),
      salesChannels,
      customers: createCustomersService({ db }),
      customerGroups: createCustomerGroupsService({ db }),
      // --- Taxonomy --------------------------------------------------------
      collections: createCollectionsService({ db }),
      categories: createCategoriesService({ db }),
      tags: createTagsService({ db }),
      // --- Tax ---------------------------------------------------------------
      taxRegions: createTaxRegionsService({ db, providers }),
      taxRates: createTaxRatesService({ db }),
      tax: createTaxService({ db, providers }),
      // --- Inventory -------------------------------------------------------
      inventory: createInventoryService({ db }),
      // --- Pricing ----------------------------------------------------------
      pricing,
      // --- Cart ---------------------------------------------------------------
      // `providers` (not a pre-built tax service) — cart.ts scopes its own tax
      // service to whatever transaction each mutation runs in (see
      // `CartServiceContext` doc comment in services/cart.ts).
      cart,
      // --- Shipping ------------------------------------------------------------
      shipping,
      // --- Promotions ----------------------------------------------------------
      // `cart.ts`'s `recalc` calls `applyCartPromotions` (a plain function, not
      // this service) directly, tx-scoped the same way tax is — this entry is
      // the admin CRUD surface only (routes/promotions, routes/campaigns).
      promotions: createPromotionsService({ db }),
      // --- Payment --------------------------------------------------------------
      payment: createPaymentService({ db, providers }),
      // --- Checkout: cart -> order -----------------------------------------------
      checkout: createCheckoutService({ db, providers, cart }),
      // --- Order edits + Fulfillments ------------------------------------------
      // orderEdits gets the tax service to price added lines.
      orderEdits: createOrderEditsService({ db, tax: createTaxService({ db, providers }) }),
      fulfillments: createFulfillmentsService({ db }),
      // --- RMA + draft orders --------------------------------------------------
      // refund flows through checkout's ledger; exchange/claim/draft outbound
      // lines carry real tax, drafts price catalogue lines via the pricing service.
      returns: createReturnsService({ db, checkout: createCheckoutService({ db, providers, cart }) }),
      exchanges: createExchangesService({ db, checkout: createCheckoutService({ db, providers, cart }), tax: createTaxService({ db, providers }) }),
      claims: createClaimsService({ db, checkout: createCheckoutService({ db, providers, cart }), tax: createTaxService({ db, providers }) }),
      draftOrders: createDraftOrdersService({ db, pricing, tax: createTaxService({ db, providers }) }),
      // --- Webhooks + notifications ---------------------------------------------
      // Admin read/CRUD surface only: the fan-out and the delivery worker are
      // plain functions driven by the drain above, not this service.
      webhooks: createWebhooksService({ db }),
      notifications: createNotificationsService({ db }),
    },
  }
  setPygmalionContext(ctx)

  // Reference data (currencies, world countries) + the store singleton:
  // idempotent, safe to run on every boot.
  await currencies.seed()
  await regions.seedCountries()
  await stores.ensure()
  // Store always has a default sales channel: the store-channel
  // middleware falls back to it when a storefront request carries no
  // publishable key (dev-permissive mode).
  await salesChannels.ensureDefaultChannel()
  // Every product without an explicit link falls back to this profile
  // (services/shipping.ts::resolveProductProfiles) — same idempotent-seed
  // shape as the default sales channel above.
  await shipping.profiles.ensureDefault()

  // ponytail: dev drain loop. Deliberately setInterval: cron's finest granularity is
  // 1 min but dev wants ~5s. Swap for a scheduled Nitro task in prod.
  const timer = setInterval(() => {
    ctx.events.drain().catch((err) => console.error('[pygmalion] outbox drain failed', err))
  }, config.drainIntervalMs)
  if (typeof timer.unref === 'function') timer.unref()

  nitroApp.hooks.hook('close', async () => {
    clearInterval(timer)
    await dispose()
  })
})
