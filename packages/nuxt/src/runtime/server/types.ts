import type {
  CategoriesService,
  // --- Cart ------------------------------------------------------------------
  CartService,
  // --- Checkout --------------------------------------------------------------
  CheckoutService,
  // --- Order edits + Fulfillments --------------------------------------------
  OrderEditsService,
  FulfillmentsService,
  // --- RMA + draft orders ----------------------------------------------------
  ReturnsService,
  ExchangesService,
  ClaimsService,
  DraftOrdersService,
  // --- Webhooks + notifications ----------------------------------------------
  WebhooksService,
  NotificationsService,
  CollectionsService,
  CurrenciesService,
  CustomerGroupsService,
  CustomersService,
  DrainResult,
  InventoryService,
  PricePreferencesService,
  PricingService,
  ProductsService,
  // --- Payment ----------------------------------------------------------------
  PaymentService,
  // --- Promotions -------------------------------------------------------------
  PromotionsService,
  PygmalionDatabase,
  RegionsService,
  SalesChannelsService,
  // --- Shipping ---------------------------------------------------------------
  ShippingService,
  StoresService,
  TagsService,
  // --- Tax ------------------------------------------------------------------
  TaxRatesService,
  TaxRegionsService,
  TaxService,
} from '@oumarbarry/pygmalion-core'

export type ProviderType = 'payment' | 'tax' | 'inventory' | 'fulfillment' | 'notification'

/** A module registers providers by exporting an array of these. */
export interface ProviderDescriptor {
  type: ProviderType
  id: string
  factory: (ctx: PygmalionContext) => unknown
}

export interface ProviderRegistry {
  get<T = unknown>(type: ProviderType, id: string): T
  /** Registered ids for a type (no instantiation); backs the `*-providers` endpoints. */
  list(type: ProviderType): { type: ProviderType; id: string }[]
}

export interface PygmalionConfig {
  databaseUrl?: string
  dataDir: string
  drainIntervalMs: number
  autoPush: boolean
  /**
   * Notification provider id resolved from the provider registry. Defaults to
   * the built-in DB-backed `local` provider; a module registering, say, a
   * `resend` provider is selected with `pygmalion: { notificationProvider:
   * 'resend' }` in `nuxt.config.ts`.
   */
  notificationProvider: string
  /**
   * Webhook retry base, ms: attempt n waits `base * 5^(n-1)`, 5s then
   * 25s by default, 3 attempts total. Lowered by E2E suites.
   */
  webhookRetryBaseMs: number
  webhookTimeoutMs: number
}

export interface PygmalionServices {
  products: ProductsService
  stores: StoresService
  regions: RegionsService
  currencies: CurrenciesService
  pricePreferences: PricePreferencesService
  salesChannels: SalesChannelsService
  customers: CustomersService
  customerGroups: CustomerGroupsService
  // --- Taxonomy -------------------------------------------------------------
  collections: CollectionsService
  categories: CategoriesService
  tags: TagsService
  // --- Tax ------------------------------------------------------------------
  taxRegions: TaxRegionsService
  taxRates: TaxRatesService
  tax: TaxService
  // --- Inventory ------------------------------------------------------------
  inventory: InventoryService
  // --- Pricing ---------------------------------------------------------------
  pricing: PricingService
  // --- Cart -------------------------------------------------------------------
  cart: CartService
  // --- Shipping ---------------------------------------------------------------
  shipping: ShippingService
  // --- Promotions --------------------------------------------------------------
  promotions: PromotionsService
  // --- Payment ------------------------------------------------------------------
  payment: PaymentService
  // --- Checkout -----------------------------------------------------------------
  checkout: CheckoutService
  // --- Order edits + Fulfillments ----------------------------------------------
  orderEdits: OrderEditsService
  fulfillments: FulfillmentsService
  // --- RMA + draft orders ------------------------------------------------------
  returns: ReturnsService
  exchanges: ExchangesService
  claims: ClaimsService
  draftOrders: DraftOrdersService
  // --- Webhooks + notifications ------------------------------------------------
  webhooks: WebhooksService
  notifications: NotificationsService
}

/** Runtime context built once at boot by the Nitro plugin. */
export interface PygmalionContext {
  db: PygmalionDatabase
  config: PygmalionConfig
  providers: ProviderRegistry
  events: { drain(): Promise<DrainResult> }
  services: PygmalionServices
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    'pygmalion:event': (e: { event: string; payload: unknown }) => void | Promise<void>
  }
}

declare module 'h3' {
  interface H3EventContext {
    pygmalion: PygmalionContext
  }
}
