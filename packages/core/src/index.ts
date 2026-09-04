export const PYGMALION_VERSION = '0.1.0'

// Helpers
export { pygId } from './id'
export { allocate, sumCents } from './money'

// DB
export type { PygmalionDatabase } from './db/types'
export { pushDbSchema, generateSchemaSql } from './db/push'

// Services
export type { ServiceContext } from './services/context'
export {
  createProductsService,
  type ProductsService,
  type ListProductsOptions,
  type GetProductOptions,
  type ProductStatusValue,
} from './services/products'
export {
  createProductInput,
  type CreateProductInput,
  updateProductInput,
  type UpdateProductInput,
  batchProductsInput,
  type BatchProductsInput,
  createVariantInput,
  type CreateVariantInput,
  updateVariantInput,
  type UpdateVariantInput,
  batchVariantsInput,
  type BatchVariantsInput,
  variantImagesInput,
  type VariantImagesInput,
  createOptionInput,
  type CreateOptionInput,
  updateOptionInput,
  type UpdateOptionInput,
  addImagesInput,
  type AddImagesInput,
} from './validation/products'
export {
  createSalesChannelsService,
  type SalesChannelsService,
  type ListSalesChannelsOptions,
} from './services/sales-channels'
export {
  createSalesChannelInput,
  type CreateSalesChannelInput,
  updateSalesChannelInput,
  type UpdateSalesChannelInput,
  channelProductsInput,
  type ChannelProductsInput,
  channelKeysInput,
  type ChannelKeysInput,
} from './validation/sales-channels'
export {
  createStoresService,
  type StoresService,
} from './services/stores'
export {
  createRegionsService,
  type RegionsService,
  type ListRegionsOptions,
  COUNTRY_SEED,
} from './services/regions'
export {
  createCurrenciesService,
  type CurrenciesService,
  type ListCurrenciesOptions,
  CURRENCY_SEED,
} from './services/currencies'
export {
  createPricePreferencesService,
  type PricePreferencesService,
  type ListPricePreferencesOptions,
} from './services/price-preferences'
export {
  createCustomersService,
  type CustomersService,
  type ListCustomersOptions,
} from './services/customers'
export {
  createCustomerGroupsService,
  type CustomerGroupsService,
  type ListCustomerGroupsOptions,
} from './services/customer-groups'
export {
  updateStoreInput,
  type UpdateStoreInput,
  setSupportedCurrenciesInput,
  type SetSupportedCurrenciesInput,
  createRegionInput,
  type CreateRegionInput,
  updateRegionInput,
  type UpdateRegionInput,
  createPricePreferenceInput,
  type CreatePricePreferenceInput,
  updatePricePreferenceInput,
  type UpdatePricePreferenceInput,
} from './validation/settings'
export {
  createCustomerInput,
  type CreateCustomerInput,
  updateCustomerInput,
  type UpdateCustomerInput,
  createCustomerAddressInput,
  type CreateCustomerAddressInput,
  updateCustomerAddressInput,
  type UpdateCustomerAddressInput,
  createCustomerGroupInput,
  type CreateCustomerGroupInput,
  updateCustomerGroupInput,
  type UpdateCustomerGroupInput,
  groupMembersInput,
  type GroupMembersInput,
} from './validation/customers'

// Events / outbox
export {
  emitDomainEvent,
  drainOutbox,
  type EventDispatch,
  type DrainOptions,
  type DrainResult,
} from './events/outbox'

// Schema types (tables live at `@oumarbarry/pygmalion-core/schema` for the registry)
export type { Product, ProductOption, ProductOptionValue, ProductVariant, ProductImage } from './schema/products'
export type { OutboxRow } from './schema/outbox'
export type { Currency, Region, RegionCountry, Store, StoreCurrency, PricePreference } from './schema/settings'
export type { SalesChannel } from './schema/sales-channels'
export type { CustomerUser, CustomerAddress, CustomerGroup, CustomerGroupMember } from './schema/customers'

// --- Taxonomy: collections, categories (mpath tree), tags ------
export {
  createCollectionsService,
  type CollectionsService,
  type ListCollectionsOptions,
} from './services/collections'
export {
  createCategoriesService,
  type CategoriesService,
  type ListCategoriesOptions,
} from './services/categories'
export { createTagsService, type TagsService, type ListTagsOptions } from './services/tags'
// --- Inventory ---------------------------------------------------------
export { createInventoryService, type InventoryService } from './services/inventory'
export {
  createDbInventoryProvider,
  type InventoryProvider,
  type InventoryAvailability,
  type ReserveItemInput,
} from './services/inventory-provider'

// --- Pricing -----------------------------------------------------------
export {
  createPricingService,
  type PricingService,
  type PricingContext,
  type CalculatedPrice,
  type ListPriceListsOptions,
  type ListPricesOptions,
} from './services/pricing'
export {
  priceRuleAttribute,
  pricingRuleOperator,
  createPriceInput,
  type CreatePriceInput,
  updatePriceInput,
  type UpdatePriceInput,
  batchPricesInput,
  type BatchPricesInput,
  priceListProductsInput,
  type PriceListProductsInput,
  createPriceListInput,
  type CreatePriceListInput,
  updatePriceListInput,
  type UpdatePriceListInput,
} from './validation/pricing'
export type { Price, PriceRule, PriceList, PriceListRule } from './schema/pricing'
export {
  createCollectionInput,
  type CreateCollectionInput,
  updateCollectionInput,
  type UpdateCollectionInput,
  collectionProductsInput,
  type CollectionProductsInput,
  createCategoryInput,
  type CreateCategoryInput,
  updateCategoryInput,
  type UpdateCategoryInput,
  categoryProductsInput,
  type CategoryProductsInput,
  createTagInput,
  type CreateTagInput,
  updateTagInput,
  type UpdateTagInput,
} from './validation/taxonomy'
export type { ProductCollection, ProductCategory, ProductTag } from './schema/taxonomy'

// --- Tax ----------------------------------------------------------------
export {
  createTaxRegionsService,
  type TaxRegionsService,
  type ListTaxRegionsOptions,
  createTaxRatesService,
  type TaxRatesService,
  type ListTaxRatesOptions,
  createTaxService,
  type TaxService,
  createSystemTaxProvider,
  type TaxProvider,
  type TaxProviderRegistry,
  type TaxServiceContext,
  type TaxRateCandidate,
  type ItemTaxCalculationLine,
  type TaxLine,
  type TaxAddress,
  type TaxCalculationContext,
  type TaxCalculationItem,
} from './services/tax'
export {
  createTaxRegionInput,
  type CreateTaxRegionInput,
  updateTaxRegionInput,
  type UpdateTaxRegionInput,
  createTaxRateInput,
  type CreateTaxRateInput,
  updateTaxRateInput,
  type UpdateTaxRateInput,
  createTaxRateRuleInput,
  type CreateTaxRateRuleInput,
} from './validation/tax'
export type { TaxRegion, TaxRate, TaxRateRule } from './schema/tax'

// --- Cart -----------------------------------------------------------------
export {
  base as cartTotalsBase,
  promotions as cartTotalsPromotions,
  shipping as cartTotalsShipping,
  tax as cartTotalsTax,
  sum as cartTotalsSum,
  runCartTotalsPipeline,
  initCartTotalsState,
  type CartTotalsState,
  type CartTotalsLine,
  type CartTotalsShippingLine,
  type CartTotalsLineInput,
  type CartTotalsShippingInput,
  type TaxLineTotal,
  type TaxStepDeps,
  type PromotionsStepDeps,
} from './services/cart-totals'
export { createCartService, type CartService, type CartServiceContext, type FullCart } from './services/cart'
export {
  createCartInput,
  type CreateCartInput,
  addLineItemInput,
  type AddLineItemInput,
  updateLineItemInput,
  type UpdateLineItemInput,
  setCartAddressesInput,
  type SetCartAddressesInput,
  type CartAddressInput,
  setCartEmailInput,
  type SetCartEmailInput,
  setShippingMethodInput,
  type SetShippingMethodInput,
  transferCartInput,
  type TransferCartInput,
} from './validation/cart'
export type {
  Cart,
  CartLineItem,
  CartLineItemAdjustment,
  CartLineItemTaxLine,
  CartShippingMethod,
  CartShippingMethodAdjustment,
  CartShippingMethodTaxLine,
  CartCreditLine,
} from './schema/cart'

// --- Shipping -------------------------------------------------------------
export {
  createShippingService,
  type ShippingService,
  type ShippingServiceContext,
  type FulfillmentProvider,
  type FulfillmentProviderRegistry,
  type CreateFulfillmentResult,
  type CalculatedShippingOptionPrice,
  type ShippingCartAddress,
  type ShippingCartLine,
  type ShippingCartContext,
  type EligibleShippingOption,
  defaultFulfillmentProvider,
  createManualFulfillmentProvider,
  geoZoneMatches,
  ruleMatches,
} from './services/shipping'
export {
  createFulfillmentSetInput,
  type CreateFulfillmentSetInput,
  updateFulfillmentSetInput,
  type UpdateFulfillmentSetInput,
  createServiceZoneInput,
  type CreateServiceZoneInput,
  updateServiceZoneInput,
  type UpdateServiceZoneInput,
  type GeoZoneInput,
  createShippingProfileInput,
  type CreateShippingProfileInput,
  updateShippingProfileInput,
  type UpdateShippingProfileInput,
  createShippingOptionInput,
  type CreateShippingOptionInput,
  updateShippingOptionInput,
  type UpdateShippingOptionInput,
  type ShippingOptionRuleInput,
  replaceShippingOptionRulesInput,
  type ReplaceShippingOptionRulesInput,
  shippingProfileProductsInput,
  type ShippingProfileProductsInput,
} from './validation/shipping'
export type {
  FulfillmentSet,
  ServiceZone,
  GeoZone,
  ShippingProfile,
  ShippingProfileProduct,
  ShippingOption,
  ShippingOptionRule,
} from './schema/fulfillment-config'
// --- Promotions -----------------------------------------------------------
export {
  computeAdjustments,
  type ApplicationMethodEngineInput,
  type BudgetDelta,
  type CampaignBudgetEngineInput,
  type EngineRule,
  type ItemAttributeContext,
  type PromotionAdjustment,
  type PromotionEligibilityContext,
  type PromotionEngineInput,
  type PromotionRuleOperator,
  type RejectionReason,
  type ShippingAttributeContext,
} from './services/promotions-engine'
export {
  applyCartPromotions,
  createPromotionsService,
  ruleAttributeOptions,
  type CartPromotionParams,
  type CartPromotionResult,
  type FullPromotion,
  type ListCampaignsOptions,
  type ListPromotionsOptions,
  type PromotionsService,
  type RuleType,
} from './services/promotions'
export {
  campaignBudgetInput,
  type CampaignBudgetInput,
  campaignPromotionsInput,
  type CampaignPromotionsInput,
  cartPromotionCodesInput,
  type CartPromotionCodesInput,
  createApplicationMethodInput,
  type CreateApplicationMethodInput,
  createCampaignInput,
  type CreateCampaignInput,
  createPromotionInput,
  type CreatePromotionInput,
  promotionRuleOperator as promotionRuleOperatorInput,
  promotionRulesBatchInput,
  type PromotionRulesBatchInput,
  ruleInput,
  type RuleInput,
  updateApplicationMethodInput,
  type UpdateApplicationMethodInput,
  updateCampaignInput,
  type UpdateCampaignInput,
  updatePromotionInput,
  type UpdatePromotionInput,
} from './validation/promotions'
export type { Campaign, CampaignBudget, CampaignBudgetUsage, Promotion, PromotionApplicationMethod, PromotionRule, PromotionRuleValue } from './schema/promotions'

// --- Inventory: validation + schema types ------------------------------
export {
  createInventoryItemInput,
  type CreateInventoryItemInput,
  updateInventoryItemInput,
  type UpdateInventoryItemInput,
  stockLocationAddressInput,
  type StockLocationAddressInput,
  createStockLocationInput,
  type CreateStockLocationInput,
  updateStockLocationInput,
  type UpdateStockLocationInput,
  upsertInventoryLevelInput,
  type UpsertInventoryLevelInput,
  linkVariantInventoryItemInput,
  type LinkVariantInventoryItemInput,
  createReservationInput,
  type CreateReservationInput,
  updateReservationInput,
  type UpdateReservationInput,
  reserveVariantsInput,
  type ReserveVariantsInput,
} from './validation/inventory'
export type {
  InventoryItem,
  InventoryLevel,
  ReservationItem,
  StockLocation,
  StockLocationAddress,
  VariantInventoryItem,
} from './schema/inventory'

// --- Payment ----------------------------------------------------
export {
  createPaymentService,
  createManualPaymentProvider,
  insertAuthorization,
  insertCapture,
  insertRefund,
  insertPaymentCollection,
  collectionAmounts,
  orderCollectionAmounts,
  paymentCapturedRefunded,
  type PaymentService,
  type PaymentServiceContext,
  type PaymentProvider,
  type PaymentProviderRegistry,
  type PaymentProviderResult,
  type PaymentData,
  type PaymentSessionStatusValue,
  type InitiatePaymentInput,
  type WebhookAction,
  type WebhookActionType,
} from './services/payment'
export {
  createPaymentCollectionInput,
  type CreatePaymentCollectionInput,
  createOrderPaymentCollectionInput,
  type CreateOrderPaymentCollectionInput,
  createRefundReasonInput,
  type CreateRefundReasonInput,
  updateRefundReasonInput,
  type UpdateRefundReasonInput,
  markAsPaidInput,
  type MarkAsPaidInput,
  createPaymentSessionInput,
  type CreatePaymentSessionInput,
  startPaymentInput,
  type StartPaymentInput,
  capturePaymentInput,
  type CapturePaymentInput,
  refundPaymentInput,
  type RefundPaymentInput,
} from './validation/payment'
export type { PaymentCollection, PaymentSession, Payment, Capture, Refund, RefundReason } from './schema/payment'

// --- Checkout + Orders ------------------------------------------
export { createCheckoutService, derivePaymentStatus, deriveFulfillmentStatus, type CheckoutService, type CheckoutServiceContext, type CompleteStatus } from './services/checkout'
export type {
  Order,
  OrderAddress,
  OrderLineItem,
  OrderShippingMethod,
  OrderTransaction,
  OrderEvent,
  OrderEdit,
  OrderEditChanges,
  Fulfillment,
  FulfillmentItem,
  FulfillmentLabel,
} from './schema/orders'

// --- Order edits + Fulfillments ---------------------------------------
export { createOrderEditsService, type OrderEditsService } from './services/order-edits'
export { createFulfillmentsService, fulfillmentStatus, type FulfillmentsService } from './services/fulfillments'
export {
  requestOrderEditInput,
  type RequestOrderEditInput,
  createFulfillmentInput,
  type CreateFulfillmentInput,
  shipFulfillmentInput,
  type ShipFulfillmentInput,
  archiveOrderInput,
  type ArchiveOrderInput,
} from './validation/orders'

// --- RMA: returns, exchanges, claims, draft orders --------------------
export { createReturnsService, type ReturnsService, type ReturnsServiceContext } from './services/returns'
export { createExchangesService, type ExchangesService, type ExchangesServiceContext } from './services/exchanges'
export { createClaimsService, type ClaimsService, type ClaimsServiceContext } from './services/claims'
export { createDraftOrdersService, type DraftOrdersService, type DraftOrdersServiceContext } from './services/draft-orders'
export type { ReturnReason, Return, ReturnItem, Exchange, ExchangeItem, Claim, ClaimItem } from './schema/rma'
export {
  createReturnReasonInput,
  type CreateReturnReasonInput,
  updateReturnReasonInput,
  type UpdateReturnReasonInput,
  requestReturnInput,
  type RequestReturnInput,
  receiveReturnInput,
  type ReceiveReturnInput,
  createExchangeInput,
  type CreateExchangeInput,
  createClaimInput,
  type CreateClaimInput,
  createDraftOrderInput,
  type CreateDraftOrderInput,
  completeDraftOrderInput,
  type CompleteDraftOrderInput,
} from './validation/orders'

// --- Webhooks + notifications ------------------------------------------
export {
  createWebhooksService,
  enqueueWebhookDeliveries,
  deliverDueWebhooks,
  signWebhookBody,
  type WebhooksService,
  type PublicWebhookEndpoint,
  type ListWebhookDeliveriesOptions,
  type DeliverWebhooksOptions,
  type DeliverWebhooksResult,
} from './services/webhooks'
export {
  createNotificationsService,
  createLocalNotificationProvider,
  enqueueEventNotifications,
  flushNotifications,
  type NotificationsService,
  type NotificationProvider,
  type NotificationChannel,
  type NewNotification,
  type ListNotificationsOptions,
  type FlushNotificationsResult,
} from './services/notifications'
export {
  createWebhookEndpointInput,
  type CreateWebhookEndpointInput,
  updateWebhookEndpointInput,
  type UpdateWebhookEndpointInput,
} from './validation/webhooks'
export type { WebhookEndpoint, WebhookDelivery } from './schema/webhooks'
export type { Notification } from './schema/notifications'
