/**
 * Admin surface (`/api/admin/**`), grouped by domain.
 *
 * Same contract as the store side: one method = one route, bodies verbatim,
 * zero business logic. Auth is the `x-api-key` header (`sk_…`) or the staff
 * session cookie — both injected at `createPygmalionClient`.
 *
 * NOT wrapped, deliberately: `POST /api/admin/uploads` + the upload read/delete
 * (multipart / raw bytes — this client speaks JSON) and `POST
 * /api/admin/auth-bootstrap` (one-shot, run before any credential exists).
 */
import type {
  AddImagesInput,
  ArchiveOrderInput,
  BatchProductsInput,
  BatchVariantsInput,
  BatchPricesInput,
  Campaign,
  CampaignPromotionsInput,
  CapturePaymentInput,
  CategoryProductsInput,
  Claim,
  CollectionProductsInput,
  CompleteDraftOrderInput,
  CreateCampaignInput,
  CreateCategoryInput,
  CreateClaimInput,
  CreateCollectionInput,
  CreateCustomerAddressInput,
  CreateCustomerGroupInput,
  CreateCustomerInput,
  CreateDraftOrderInput,
  CreateExchangeInput,
  CreateFulfillmentInput,
  CreateFulfillmentSetInput,
  CreateInventoryItemInput,
  CreateOptionInput,
  CreateOrderPaymentCollectionInput,
  CreatePriceListInput,
  CreatePricePreferenceInput,
  CreateProductInput,
  CreatePromotionInput,
  CreateRefundReasonInput,
  CreateRegionInput,
  CreateReservationInput,
  CreateReturnReasonInput,
  CreateSalesChannelInput,
  CreateServiceZoneInput,
  CreateShippingOptionInput,
  CreateShippingProfileInput,
  CreateStockLocationInput,
  CreateTagInput,
  CreateTaxRateInput,
  CreateTaxRateRuleInput,
  CreateTaxRegionInput,
  CreateVariantInput,
  CreateWebhookEndpointInput,
  Currency,
  CustomerAddress,
  CustomerGroup,
  CustomerGroupMember,
  CustomerUser,
  Exchange,
  Fulfillment,
  GroupMembersInput,
  InventoryItem,
  InventoryLevel,
  LinkVariantInventoryItemInput,
  MarkAsPaidInput,
  Notification,
  Order,
  OrderEdit,
  Payment,
  PaymentCollection,
  PaymentSession,
  Price,
  PriceList,
  PriceListProductsInput,
  PricePreference,
  Product,
  ProductCategory,
  ProductCollection,
  ProductImage,
  ProductOption,
  ProductTag,
  ProductVariant,
  Promotion,
  PromotionRulesBatchInput,
  ReceiveReturnInput,
  RefundPaymentInput,
  RefundReason,
  Region,
  ReplaceShippingOptionRulesInput,
  ReservationItem,
  RequestOrderEditInput,
  RequestReturnInput,
  Return,
  ReturnReason,
  RuleType,
  SalesChannel,
  ShipFulfillmentInput,
  ShippingProfileProductsInput,
  StockLocation,
  Store,
  TaxRate,
  TaxRateRule,
  TaxRegion,
  UpdateCampaignInput,
  UpdateCategoryInput,
  UpdateCollectionInput,
  UpdateCustomerAddressInput,
  UpdateCustomerGroupInput,
  UpdateCustomerInput,
  UpdateFulfillmentSetInput,
  UpdateInventoryItemInput,
  UpdateOptionInput,
  UpdatePriceListInput,
  UpdatePricePreferenceInput,
  UpdateProductInput,
  UpdatePromotionInput,
  UpdateRefundReasonInput,
  UpdateRegionInput,
  UpdateReservationInput,
  UpdateReturnReasonInput,
  UpdateSalesChannelInput,
  UpdateServiceZoneInput,
  UpdateShippingOptionInput,
  UpdateShippingProfileInput,
  UpdateStockLocationInput,
  UpdateStoreInput,
  UpdateTagInput,
  UpdateTaxRateInput,
  UpdateTaxRegionInput,
  UpdateVariantInput,
  UpdateWebhookEndpointInput,
  UpsertInventoryLevelInput,
  VariantImagesInput,
  VariantInventoryItem,
  WebhookDelivery,
  WebhookEndpoint,
  CalculatedPrice,
  OrderEvent,
} from '@oumarbarry/pygmalion-core'
import type { RequestFn } from './client'
import type {
  BatchPricesResult,
  BatchProductsResult,
  BatchVariantsResult,
  ClaimResult,
  ExchangeResult,
  FullDraftOrder,
  FullOrder,
  ListQuery,
  OrderEditPreview,
  PriceListProductsResult,
  ProviderRef,
  ReturnResult,
} from './types'

const enc = encodeURIComponent

export function createAdminResources(request: RequestFn) {
  return {
    // --- Catalogue -----------------------------------------------------------
    products: {
      list: (query?: ListQuery & { status?: string; handle?: string }) =>
        request<{ products: Product[] }>('GET', '/api/admin/products', { query }),
      create: (body: CreateProductInput) => request<{ product: Product }>('POST', '/api/admin/products', { body }),
      batch: (body: BatchProductsInput) => request<BatchProductsResult>('POST', '/api/admin/products/batch', { body }),
      get: (id: string) => request<{ product: Product }>('GET', `/api/admin/products/${enc(id)}`),
      update: (id: string, body: UpdateProductInput) => request<{ product: Product }>('POST', `/api/admin/products/${enc(id)}`, { body }),
      remove: (id: string) => request<{ product: Product }>('DELETE', `/api/admin/products/${enc(id)}`),
      /** Ordered images. */
      listImages: (productId: string) => request<{ images: ProductImage[] }>('GET', `/api/admin/products/${enc(productId)}/images`),
      variants: {
        list: (productId: string) => request<{ variants: ProductVariant[] }>('GET', `/api/admin/products/${enc(productId)}/variants`),
        /** Variant to inventory-item links, kits included. */
        inventoryItems: (productId: string, variantId: string) =>
          request<{ inventoryItems: VariantInventoryItem[] }>('GET', `/api/admin/products/${enc(productId)}/variants/${enc(variantId)}/inventory-items`),
        create: (productId: string, body: CreateVariantInput) =>
          request<{ variant: ProductVariant }>('POST', `/api/admin/products/${enc(productId)}/variants`, { body }),
        batch: (productId: string, body: BatchVariantsInput) =>
          request<BatchVariantsResult>('POST', `/api/admin/products/${enc(productId)}/variants/batch`, { body }),
        get: (productId: string, variantId: string) =>
          request<{ variant: ProductVariant }>('GET', `/api/admin/products/${enc(productId)}/variants/${enc(variantId)}`),
        update: (productId: string, variantId: string, body: UpdateVariantInput) =>
          request<{ variant: ProductVariant }>('POST', `/api/admin/products/${enc(productId)}/variants/${enc(variantId)}`, { body }),
        remove: (productId: string, variantId: string) =>
          request<{ variant: ProductVariant }>('DELETE', `/api/admin/products/${enc(productId)}/variants/${enc(variantId)}`),
        setImages: (productId: string, variantId: string, body: VariantImagesInput) =>
          request<{ imageIds: string[] }>('POST', `/api/admin/products/${enc(productId)}/variants/${enc(variantId)}/images`, { body }),
      },
      options: {
        list: (productId: string) => request<{ options: ProductOption[] }>('GET', `/api/admin/products/${enc(productId)}/options`),
        create: (productId: string, body: CreateOptionInput) =>
          request<{ option: ProductOption }>('POST', `/api/admin/products/${enc(productId)}/options`, { body }),
        update: (productId: string, optionId: string, body: UpdateOptionInput) =>
          request<{ option: ProductOption }>('POST', `/api/admin/products/${enc(productId)}/options/${enc(optionId)}`, { body }),
        remove: (productId: string, optionId: string) =>
          request<{ option: ProductOption }>('DELETE', `/api/admin/products/${enc(productId)}/options/${enc(optionId)}`),
      },
      images: {
        add: (productId: string, body: AddImagesInput) =>
          request<{ images: ProductImage[] }>('POST', `/api/admin/products/${enc(productId)}/images`, { body }),
        remove: (productId: string, imageId: string) =>
          request<{ image: ProductImage }>('DELETE', `/api/admin/products/${enc(productId)}/images/${enc(imageId)}`),
      },
    },
    collections: {
      list: (query?: ListQuery) => request<{ collections: ProductCollection[] }>('GET', '/api/admin/collections', { query }),
      create: (body: CreateCollectionInput) => request<{ collection: ProductCollection }>('POST', '/api/admin/collections', { body }),
      get: (id: string) => request<{ collection: ProductCollection }>('GET', `/api/admin/collections/${enc(id)}`),
      update: (id: string, body: UpdateCollectionInput) =>
        request<{ collection: ProductCollection }>('POST', `/api/admin/collections/${enc(id)}`, { body }),
      remove: (id: string) => request<{ collection: ProductCollection }>('DELETE', `/api/admin/collections/${enc(id)}`),
      setProducts: (id: string, body: CollectionProductsInput) =>
        request<{ productIds: string[] }>('POST', `/api/admin/collections/${enc(id)}/products`, { body }),
    },
    categories: {
      list: (query?: ListQuery) => request<{ categories: ProductCategory[] }>('GET', '/api/admin/product-categories', { query }),
      create: (body: CreateCategoryInput) => request<{ category: ProductCategory }>('POST', '/api/admin/product-categories', { body }),
      get: (id: string) => request<{ category: ProductCategory }>('GET', `/api/admin/product-categories/${enc(id)}`),
      update: (id: string, body: UpdateCategoryInput) =>
        request<{ category: ProductCategory }>('POST', `/api/admin/product-categories/${enc(id)}`, { body }),
      remove: (id: string) => request<{ category: ProductCategory }>('DELETE', `/api/admin/product-categories/${enc(id)}`),
      setProducts: (id: string, body: CategoryProductsInput) =>
        request<{ productIds: string[] }>('POST', `/api/admin/product-categories/${enc(id)}/products`, { body }),
    },
    tags: {
      list: (query?: ListQuery) => request<{ tags: ProductTag[] }>('GET', '/api/admin/product-tags', { query }),
      create: (body: CreateTagInput) => request<{ tag: ProductTag }>('POST', '/api/admin/product-tags', { body }),
      get: (id: string) => request<{ tag: ProductTag }>('GET', `/api/admin/product-tags/${enc(id)}`),
      update: (id: string, body: UpdateTagInput) => request<{ tag: ProductTag }>('POST', `/api/admin/product-tags/${enc(id)}`, { body }),
      remove: (id: string) => request<{ tag: ProductTag }>('DELETE', `/api/admin/product-tags/${enc(id)}`),
      listProducts: (id: string) => request<{ productIds: string[] }>('GET', `/api/admin/product-tags/${enc(id)}/products`),
      setProducts: (id: string, body: { add?: string[]; remove?: string[] }) =>
        request<{ productIds: string[] }>('POST', `/api/admin/product-tags/${enc(id)}/products`, { body }),
    },

    // --- Prix ----------------------------------------------------------------
    priceLists: {
      list: (query?: ListQuery) => request<{ priceLists: PriceList[] }>('GET', '/api/admin/price-lists', { query }),
      create: (body: CreatePriceListInput) => request<{ priceList: PriceList }>('POST', '/api/admin/price-lists', { body }),
      get: (id: string) => request<{ priceList: PriceList }>('GET', `/api/admin/price-lists/${enc(id)}`),
      update: (id: string, body: UpdatePriceListInput) =>
        request<{ priceList: PriceList }>('POST', `/api/admin/price-lists/${enc(id)}`, { body }),
      remove: (id: string) => request<{ priceList: PriceList }>('DELETE', `/api/admin/price-lists/${enc(id)}`),
      prices: (id: string, query?: ListQuery) => request<{ prices: Price[] }>('GET', `/api/admin/price-lists/${enc(id)}/prices`, { query }),
      batchPrices: (id: string, body: BatchPricesInput) =>
        request<BatchPricesResult>('POST', `/api/admin/price-lists/${enc(id)}/prices/batch`, { body }),
      addProducts: (id: string, body: PriceListProductsInput) =>
        request<PriceListProductsResult>('POST', `/api/admin/price-lists/${enc(id)}/products`, { body }),
    },
    prices: {
      /** Default (non-list) prices of variants/shipping options: create + update + delete in one call. */
      batch: (body: BatchPricesInput) => request<BatchPricesResult>('POST', '/api/admin/prices/batch', { body }),
    },
    productVariants: {
      /** Raw price rows of a variant. */
      prices: (variantId: string) => request<{ prices: Price[] }>('GET', `/api/admin/product-variants/${enc(variantId)}/prices`),
      /** Calculated price of a variant, used for exchange and claim outbound lines. */
      price: (variantId: string, query: { currency_code: string; region_id?: string }) =>
        request<{ price: CalculatedPrice | null }>('GET', `/api/admin/product-variants/${enc(variantId)}/price`, { query }),
    },
    pricePreferences: {
      list: (query?: ListQuery) => request<{ pricePreferences: PricePreference[] }>('GET', '/api/admin/price-preferences', { query }),
      create: (body: CreatePricePreferenceInput) =>
        request<{ pricePreference: PricePreference }>('POST', '/api/admin/price-preferences', { body }),
      get: (id: string) => request<{ pricePreference: PricePreference }>('GET', `/api/admin/price-preferences/${enc(id)}`),
      update: (id: string, body: UpdatePricePreferenceInput) =>
        request<{ pricePreference: PricePreference }>('POST', `/api/admin/price-preferences/${enc(id)}`, { body }),
      remove: (id: string) => request<{ id: string }>('DELETE', `/api/admin/price-preferences/${enc(id)}`),
    },

    // --- Commandes -----------------------------------------------------------
    orders: {
      list: (query?: ListQuery & { status?: string }) => request<{ orders: Order[]; count: number }>('GET', '/api/admin/orders', { query }),
      get: (id: string) => request<{ order: FullOrder }>('GET', `/api/admin/orders/${enc(id)}`),
      /** Append-only audit journal. */
      events: (id: string, query?: ListQuery) =>
        request<{ events: OrderEvent[] }>('GET', `/api/admin/orders/${enc(id)}/events`, { query }),
      capture: (id: string, body?: { amount?: number }) => request<{ order: FullOrder }>('POST', `/api/admin/orders/${enc(id)}/capture`, { body: body ?? {} }),
      refund: (id: string, body?: { amount?: number; refundReasonId?: string; note?: string }) =>
        request<{ order: FullOrder }>('POST', `/api/admin/orders/${enc(id)}/refund`, { body: body ?? {} }),
      cancel: (id: string) => request<{ order: FullOrder }>('POST', `/api/admin/orders/${enc(id)}/cancel`, { body: {} }),
      archive: (id: string, body?: ArchiveOrderInput) =>
        request<{ order: FullOrder }>('POST', `/api/admin/orders/${enc(id)}/archive`, { body: body ?? {} }),
      /** One flow is one atomic call: the whole edit, then preview/confirm. */
      edits: {
        create: (orderId: string, body: RequestOrderEditInput) =>
          request<{ orderEdit: OrderEdit }>('POST', `/api/admin/orders/${enc(orderId)}/edits`, { body }),
        preview: (orderId: string, editId: string) =>
          request<{ preview: OrderEditPreview }>('GET', `/api/admin/orders/${enc(orderId)}/edits/${enc(editId)}/preview`),
        confirm: (orderId: string, editId: string) =>
          request<{ order: FullOrder }>('POST', `/api/admin/orders/${enc(orderId)}/edits/${enc(editId)}/confirm`, { body: {} }),
        cancel: (orderId: string, editId: string) =>
          request<{ orderEdit: OrderEdit }>('POST', `/api/admin/orders/${enc(orderId)}/edits/${enc(editId)}/cancel`, { body: {} }),
      },
      fulfillments: {
        create: (orderId: string, body: CreateFulfillmentInput) =>
          request<{ fulfillment: Fulfillment }>('POST', `/api/admin/orders/${enc(orderId)}/fulfillments`, { body }),
        ship: (orderId: string, fulfillmentId: string, body: ShipFulfillmentInput) =>
          request<{ fulfillment: Fulfillment }>('POST', `/api/admin/orders/${enc(orderId)}/fulfillments/${enc(fulfillmentId)}/shipments`, { body }),
        markAsDelivered: (orderId: string, fulfillmentId: string) =>
          request<{ fulfillment: Fulfillment }>(
            'POST',
            `/api/admin/orders/${enc(orderId)}/fulfillments/${enc(fulfillmentId)}/mark-as-delivered`,
            { body: {} },
          ),
        cancel: (orderId: string, fulfillmentId: string) =>
          request<{ fulfillment: Fulfillment }>('POST', `/api/admin/orders/${enc(orderId)}/fulfillments/${enc(fulfillmentId)}/cancel`, {
            body: {},
          }),
      },
    },
    draftOrders: {
      list: (query?: ListQuery) => request<{ draftOrders: Order[] }>('GET', '/api/admin/draft-orders', { query }),
      create: (body: CreateDraftOrderInput) => request<{ draftOrder: FullDraftOrder }>('POST', '/api/admin/draft-orders', { body }),
      get: (id: string) => request<{ draftOrder: FullDraftOrder }>('GET', `/api/admin/draft-orders/${enc(id)}`),
      convertToOrder: (id: string, body?: CompleteDraftOrderInput) =>
        request<{ order: FullOrder }>('POST', `/api/admin/draft-orders/${enc(id)}/convert-to-order`, { body: body ?? {} }),
      cancel: (id: string) => request<{ draftOrder: FullDraftOrder }>('POST', `/api/admin/draft-orders/${enc(id)}/cancel`, { body: {} }),
    },

    // --- RMA -----------------------------------------------------------------
    returns: {
      list: (query?: ListQuery & { orderId?: string }) => request<{ returns: Return[] }>('GET', '/api/admin/returns', { query }),
      create: (body: RequestReturnInput & { orderId: string }) => request<ReturnResult>('POST', '/api/admin/returns', { body }),
      get: (id: string) => request<{ return: Return }>('GET', `/api/admin/returns/${enc(id)}`),
      receive: (id: string, body: ReceiveReturnInput) => request<{ return: Return }>('POST', `/api/admin/returns/${enc(id)}/receive`, { body }),
      cancel: (id: string) => request<{ return: Return }>('POST', `/api/admin/returns/${enc(id)}/cancel`, { body: {} }),
    },
    returnReasons: {
      list: (query?: ListQuery) => request<{ returnReasons: ReturnReason[] }>('GET', '/api/admin/return-reasons', { query }),
      create: (body: CreateReturnReasonInput) => request<{ returnReason: ReturnReason }>('POST', '/api/admin/return-reasons', { body }),
      get: (id: string) => request<{ returnReason: ReturnReason }>('GET', `/api/admin/return-reasons/${enc(id)}`),
      update: (id: string, body: UpdateReturnReasonInput) =>
        request<{ returnReason: ReturnReason }>('POST', `/api/admin/return-reasons/${enc(id)}`, { body }),
      remove: (id: string) => request<{ id: string }>('DELETE', `/api/admin/return-reasons/${enc(id)}`),
    },
    exchanges: {
      list: (query?: ListQuery & { orderId?: string }) => request<{ exchanges: Exchange[] }>('GET', '/api/admin/exchanges', { query }),
      create: (body: CreateExchangeInput & { orderId: string }) => request<ExchangeResult>('POST', '/api/admin/exchanges', { body }),
      get: (id: string) => request<{ exchange: Exchange }>('GET', `/api/admin/exchanges/${enc(id)}`),
      complete: (id: string) => request<{ exchange: Exchange }>('POST', `/api/admin/exchanges/${enc(id)}/complete`, { body: {} }),
      cancel: (id: string) => request<{ exchange: Exchange }>('POST', `/api/admin/exchanges/${enc(id)}/cancel`, { body: {} }),
    },
    claims: {
      list: (query?: ListQuery & { orderId?: string }) => request<{ claims: Claim[] }>('GET', '/api/admin/claims', { query }),
      create: (body: CreateClaimInput & { orderId: string }) => request<ClaimResult>('POST', '/api/admin/claims', { body }),
      get: (id: string) => request<{ claim: Claim }>('GET', `/api/admin/claims/${enc(id)}`),
      complete: (id: string) => request<{ claim: Claim }>('POST', `/api/admin/claims/${enc(id)}/complete`, { body: {} }),
      cancel: (id: string) => request<{ claim: Claim }>('POST', `/api/admin/claims/${enc(id)}/cancel`, { body: {} }),
    },

    // --- Paiement ------------------------------------------------------------
    payments: {
      list: (query?: ListQuery & { orderId?: string; collectionId?: string }) =>
        request<{ payments: Payment[] }>('GET', '/api/admin/payments', { query }),
      providers: () => request<{ paymentProviders: ProviderRef[] }>('GET', '/api/admin/payments/payment-providers'),
      get: (id: string) => request<{ payment: Payment }>('GET', `/api/admin/payments/${enc(id)}`),
      /** Capture a PRECISE payment — an order with several collections has several. */
      capture: (id: string, body?: CapturePaymentInput) =>
        request<{ payment: Payment }>('POST', `/api/admin/payments/${enc(id)}/capture`, { body: body ?? {} }),
      refund: (id: string, body?: RefundPaymentInput) =>
        request<{ payment: Payment }>('POST', `/api/admin/payments/${enc(id)}/refund`, { body: body ?? {} }),
    },
    paymentCollections: {
      /** Additional collection on an order (edit surplus, exchange difference). */
      create: (body: CreateOrderPaymentCollectionInput) =>
        request<{ paymentCollection: PaymentCollection }>('POST', '/api/admin/payment-collections', { body }),
      createSession: (id: string, body?: { providerId?: string }) =>
        request<{ paymentSession: PaymentSession }>('POST', `/api/admin/payment-collections/${enc(id)}/payment-sessions`, {
          body: body ?? {},
        }),
      markAsPaid: (id: string, body?: MarkAsPaidInput) =>
        request<{ paymentCollection: PaymentCollection }>('POST', `/api/admin/payment-collections/${enc(id)}/mark-as-paid`, {
          body: body ?? {},
        }),
    },
    refundReasons: {
      list: (query?: ListQuery) => request<{ refundReasons: RefundReason[] }>('GET', '/api/admin/refund-reasons', { query }),
      create: (body: CreateRefundReasonInput) => request<{ refundReason: RefundReason }>('POST', '/api/admin/refund-reasons', { body }),
      get: (id: string) => request<{ refundReason: RefundReason }>('GET', `/api/admin/refund-reasons/${enc(id)}`),
      update: (id: string, body: UpdateRefundReasonInput) =>
        request<{ refundReason: RefundReason }>('POST', `/api/admin/refund-reasons/${enc(id)}`, { body }),
      remove: (id: string) => request<{ id: string }>('DELETE', `/api/admin/refund-reasons/${enc(id)}`),
    },

    // --- Clients -------------------------------------------------------------
    customers: {
      list: (query?: ListQuery) => request<{ customers: CustomerUser[] }>('GET', '/api/admin/customers', { query }),
      create: (body: CreateCustomerInput) => request<{ customer: CustomerUser }>('POST', '/api/admin/customers', { body }),
      get: (id: string) => request<{ customer: CustomerUser }>('GET', `/api/admin/customers/${enc(id)}`),
      update: (id: string, body: UpdateCustomerInput) =>
        request<{ customer: CustomerUser }>('PATCH', `/api/admin/customers/${enc(id)}`, { body }),
      addresses: {
        list: (customerId: string) => request<{ addresses: CustomerAddress[] }>('GET', `/api/admin/customers/${enc(customerId)}/addresses`),
        create: (customerId: string, body: CreateCustomerAddressInput) =>
          request<{ address: CustomerAddress }>('POST', `/api/admin/customers/${enc(customerId)}/addresses`, { body }),
        get: (customerId: string, addressId: string) =>
          request<{ address: CustomerAddress }>('GET', `/api/admin/customers/${enc(customerId)}/addresses/${enc(addressId)}`),
        update: (customerId: string, addressId: string, body: UpdateCustomerAddressInput) =>
          request<{ address: CustomerAddress }>('PATCH', `/api/admin/customers/${enc(customerId)}/addresses/${enc(addressId)}`, { body }),
        remove: (customerId: string, addressId: string) =>
          request<{ id: string }>('DELETE', `/api/admin/customers/${enc(customerId)}/addresses/${enc(addressId)}`),
      },
      groups: {
        list: (customerId: string) => request<{ customerGroups: CustomerGroup[] }>('GET', `/api/admin/customers/${enc(customerId)}/customer-groups`),
        set: (customerId: string, body: { groupIds: string[] }) =>
          request<{ customerGroups: CustomerGroup[] }>('POST', `/api/admin/customers/${enc(customerId)}/customer-groups`, { body }),
      },
    },
    customerGroups: {
      list: (query?: ListQuery) => request<{ groups: CustomerGroup[] }>('GET', '/api/admin/customer-groups', { query }),
      create: (body: CreateCustomerGroupInput) => request<{ group: CustomerGroup }>('POST', '/api/admin/customer-groups', { body }),
      get: (id: string) => request<{ group: CustomerGroup }>('GET', `/api/admin/customer-groups/${enc(id)}`),
      update: (id: string, body: UpdateCustomerGroupInput) =>
        request<{ group: CustomerGroup }>('PATCH', `/api/admin/customer-groups/${enc(id)}`, { body }),
      remove: (id: string) => request<{ group: CustomerGroup }>('DELETE', `/api/admin/customer-groups/${enc(id)}`),
      setMembers: (id: string, body: GroupMembersInput) =>
        request<{ members: CustomerGroupMember[] }>('POST', `/api/admin/customer-groups/${enc(id)}/members`, { body }),
    },

    // --- Promotions ----------------------------------------------------------
    promotions: {
      list: (query?: ListQuery) => request<{ promotions: Promotion[] }>('GET', '/api/admin/promotions', { query }),
      create: (body: CreatePromotionInput) => request<{ promotion: Promotion }>('POST', '/api/admin/promotions', { body }),
      ruleAttributeOptions: (ruleType: RuleType) =>
        request<{ attributes: { id: string; value: string; label: string; operators: string[] }[] }>(
          'GET',
          `/api/admin/promotions/rule-attribute-options/${enc(ruleType)}`,
        ),
      get: (id: string) => request<{ promotion: Promotion }>('GET', `/api/admin/promotions/${enc(id)}`),
      update: (id: string, body: UpdatePromotionInput) => request<{ promotion: Promotion }>('POST', `/api/admin/promotions/${enc(id)}`, { body }),
      remove: (id: string) => request<{ promotion: Promotion }>('DELETE', `/api/admin/promotions/${enc(id)}`),
      setRules: (id: string, body: PromotionRulesBatchInput) =>
        request<{ promotion: Promotion }>('POST', `/api/admin/promotions/${enc(id)}/rules/batch`, { body }),
      setTargetRules: (id: string, body: PromotionRulesBatchInput) =>
        request<{ promotion: Promotion }>('POST', `/api/admin/promotions/${enc(id)}/target-rules/batch`, { body }),
      setBuyRules: (id: string, body: PromotionRulesBatchInput) =>
        request<{ promotion: Promotion }>('POST', `/api/admin/promotions/${enc(id)}/buy-rules/batch`, { body }),
    },
    campaigns: {
      list: (query?: ListQuery) => request<{ campaigns: Campaign[] }>('GET', '/api/admin/campaigns', { query }),
      create: (body: CreateCampaignInput) => request<{ campaign: Campaign }>('POST', '/api/admin/campaigns', { body }),
      get: (id: string) => request<{ campaign: Campaign }>('GET', `/api/admin/campaigns/${enc(id)}`),
      update: (id: string, body: UpdateCampaignInput) => request<{ campaign: Campaign }>('POST', `/api/admin/campaigns/${enc(id)}`, { body }),
      remove: (id: string) => request<{ campaign: Campaign }>('DELETE', `/api/admin/campaigns/${enc(id)}`),
      setPromotions: (id: string, body: CampaignPromotionsInput) =>
        request<{ promotions: Promotion[] }>('POST', `/api/admin/campaigns/${enc(id)}/promotions`, { body }),
    },

    // --- Expédition ----------------------------------------------------------
    shippingOptions: {
      list: (query?: ListQuery) => request<{ shippingOptions: unknown[] }>('GET', '/api/admin/shipping-options', { query }),
      create: (body: CreateShippingOptionInput) => request<{ shippingOption: unknown }>('POST', '/api/admin/shipping-options', { body }),
      get: (id: string) => request<{ shippingOption: unknown }>('GET', `/api/admin/shipping-options/${enc(id)}`),
      update: (id: string, body: UpdateShippingOptionInput) =>
        request<{ shippingOption: unknown }>('POST', `/api/admin/shipping-options/${enc(id)}`, { body }),
      remove: (id: string) => request<{ shippingOption: unknown }>('DELETE', `/api/admin/shipping-options/${enc(id)}`),
      setRules: (id: string, body: ReplaceShippingOptionRulesInput) =>
        request<{ rules: unknown[] }>('POST', `/api/admin/shipping-options/${enc(id)}/rules/batch`, { body }),
    },
    shippingProfiles: {
      list: (query?: ListQuery) => request<{ shippingProfiles: unknown[] }>('GET', '/api/admin/shipping-profiles', { query }),
      create: (body: CreateShippingProfileInput) => request<{ shippingProfile: unknown }>('POST', '/api/admin/shipping-profiles', { body }),
      get: (id: string) => request<{ shippingProfile: unknown }>('GET', `/api/admin/shipping-profiles/${enc(id)}`),
      update: (id: string, body: UpdateShippingProfileInput) =>
        request<{ shippingProfile: unknown }>('POST', `/api/admin/shipping-profiles/${enc(id)}`, { body }),
      remove: (id: string) => request<{ shippingProfile: unknown }>('DELETE', `/api/admin/shipping-profiles/${enc(id)}`),
      setProducts: (id: string, body: ShippingProfileProductsInput) =>
        request<{ productIds: string[] }>('POST', `/api/admin/shipping-profiles/${enc(id)}/products`, { body }),
    },
    fulfillmentSets: {
      list: (query?: ListQuery) => request<{ fulfillmentSets: unknown[] }>('GET', '/api/admin/fulfillment-sets', { query }),
      create: (body: CreateFulfillmentSetInput) => request<{ fulfillmentSet: unknown }>('POST', '/api/admin/fulfillment-sets', { body }),
      get: (id: string) => request<{ fulfillmentSet: unknown }>('GET', `/api/admin/fulfillment-sets/${enc(id)}`),
      update: (id: string, body: UpdateFulfillmentSetInput) =>
        request<{ fulfillmentSet: unknown }>('POST', `/api/admin/fulfillment-sets/${enc(id)}`, { body }),
      remove: (id: string) => request<{ fulfillmentSet: unknown }>('DELETE', `/api/admin/fulfillment-sets/${enc(id)}`),
      createServiceZone: (id: string, body: CreateServiceZoneInput) =>
        request<{ serviceZone: unknown }>('POST', `/api/admin/fulfillment-sets/${enc(id)}/service-zones`, { body }),
      getServiceZone: (id: string, zoneId: string) =>
        request<{ serviceZone: unknown }>('GET', `/api/admin/fulfillment-sets/${enc(id)}/service-zones/${enc(zoneId)}`),
      updateServiceZone: (id: string, zoneId: string, body: UpdateServiceZoneInput) =>
        request<{ serviceZone: unknown }>('POST', `/api/admin/fulfillment-sets/${enc(id)}/service-zones/${enc(zoneId)}`, { body }),
      removeServiceZone: (id: string, zoneId: string) =>
        request<{ serviceZone: unknown }>('DELETE', `/api/admin/fulfillment-sets/${enc(id)}/service-zones/${enc(zoneId)}`),
    },
    fulfillmentProviders: {
      list: () => request<{ fulfillmentProviders: ProviderRef[] }>('GET', '/api/admin/fulfillment-providers'),
    },

    // --- Stock ---------------------------------------------------------------
    inventoryItems: {
      list: (query?: ListQuery) => request<{ inventoryItems: InventoryItem[] }>('GET', '/api/admin/inventory-items', { query }),
      create: (body: CreateInventoryItemInput) => request<{ inventoryItem: InventoryItem }>('POST', '/api/admin/inventory-items', { body }),
      get: (id: string) => request<{ inventoryItem: InventoryItem }>('GET', `/api/admin/inventory-items/${enc(id)}`),
      update: (id: string, body: UpdateInventoryItemInput) =>
        request<{ inventoryItem: InventoryItem }>('POST', `/api/admin/inventory-items/${enc(id)}`, { body }),
      remove: (id: string) => request<{ inventoryItem: InventoryItem }>('DELETE', `/api/admin/inventory-items/${enc(id)}`),
      locationLevels: (id: string) => request<{ locationLevels: InventoryLevel[] }>('GET', `/api/admin/inventory-items/${enc(id)}/location-levels`),
      setLocationLevel: (id: string, locationId: string, body: UpsertInventoryLevelInput) =>
        request<{ level: InventoryLevel }>('POST', `/api/admin/inventory-items/${enc(id)}/location-levels/${enc(locationId)}`, { body }),
      removeLocationLevel: (id: string, locationId: string) =>
        request<{ level: InventoryLevel }>('DELETE', `/api/admin/inventory-items/${enc(id)}/location-levels/${enc(locationId)}`),
      linkVariant: (id: string, body: LinkVariantInventoryItemInput) =>
        request<{ link: VariantInventoryItem }>('POST', `/api/admin/inventory-items/${enc(id)}/variants`, { body }),
      unlinkVariant: (id: string, variantId: string) =>
        request<{ link: VariantInventoryItem }>('DELETE', `/api/admin/inventory-items/${enc(id)}/variants/${enc(variantId)}`),
    },
    stockLocations: {
      list: (query?: ListQuery) => request<{ stockLocations: StockLocation[] }>('GET', '/api/admin/stock-locations', { query }),
      create: (body: CreateStockLocationInput) => request<{ stockLocation: StockLocation }>('POST', '/api/admin/stock-locations', { body }),
      get: (id: string) => request<{ stockLocation: StockLocation }>('GET', `/api/admin/stock-locations/${enc(id)}`),
      update: (id: string, body: UpdateStockLocationInput) =>
        request<{ stockLocation: StockLocation }>('POST', `/api/admin/stock-locations/${enc(id)}`, { body }),
      remove: (id: string) => request<{ stockLocation: StockLocation }>('DELETE', `/api/admin/stock-locations/${enc(id)}`),
    },
    reservations: {
      list: (query?: ListQuery & { inventoryItemId?: string; lineItemId?: string }) =>
        request<{ reservations: ReservationItem[] }>('GET', '/api/admin/reservations', { query }),
      create: (body: CreateReservationInput) => request<{ reservation: ReservationItem }>('POST', '/api/admin/reservations', { body }),
      get: (id: string) => request<{ reservation: ReservationItem }>('GET', `/api/admin/reservations/${enc(id)}`),
      update: (id: string, body: UpdateReservationInput) =>
        request<{ reservation: ReservationItem }>('POST', `/api/admin/reservations/${enc(id)}`, { body }),
      remove: (id: string) => request<{ reservation: ReservationItem }>('DELETE', `/api/admin/reservations/${enc(id)}`),
    },

    // --- Taxes ---------------------------------------------------------------
    taxRegions: {
      list: (query?: ListQuery) => request<{ taxRegions: TaxRegion[]; count?: number }>('GET', '/api/admin/tax-regions', { query }),
      create: (body: CreateTaxRegionInput) => request<{ taxRegion: TaxRegion }>('POST', '/api/admin/tax-regions', { body }),
      get: (id: string) => request<{ taxRegion: TaxRegion }>('GET', `/api/admin/tax-regions/${enc(id)}`),
      update: (id: string, body: UpdateTaxRegionInput) => request<{ taxRegion: TaxRegion }>('POST', `/api/admin/tax-regions/${enc(id)}`, { body }),
      remove: (id: string) => request<{ taxRegion: TaxRegion }>('DELETE', `/api/admin/tax-regions/${enc(id)}`),
    },
    taxRates: {
      list: (query?: ListQuery & { taxRegionId?: string }) => request<{ taxRates: TaxRate[] }>('GET', '/api/admin/tax-rates', { query }),
      create: (body: CreateTaxRateInput) => request<{ taxRate: TaxRate }>('POST', '/api/admin/tax-rates', { body }),
      get: (id: string) => request<{ taxRate: TaxRate }>('GET', `/api/admin/tax-rates/${enc(id)}`),
      update: (id: string, body: UpdateTaxRateInput) => request<{ taxRate: TaxRate }>('POST', `/api/admin/tax-rates/${enc(id)}`, { body }),
      remove: (id: string) => request<{ taxRate: TaxRate }>('DELETE', `/api/admin/tax-rates/${enc(id)}`),
      addRule: (id: string, body: CreateTaxRateRuleInput) => request<{ rule: TaxRateRule }>('POST', `/api/admin/tax-rates/${enc(id)}/rules`, { body }),
      removeRule: (id: string, ruleId: string) =>
        request<{ rule: TaxRateRule }>('DELETE', `/api/admin/tax-rates/${enc(id)}/rules/${enc(ruleId)}`),
    },
    taxProviders: {
      list: () => request<{ taxProviders: ProviderRef[] }>('GET', '/api/admin/tax-providers'),
    },

    // --- Boutique & configuration -------------------------------------------
    regions: {
      list: (query?: ListQuery) => request<{ regions: Region[] }>('GET', '/api/admin/regions', { query }),
      create: (body: CreateRegionInput) => request<{ region: Region }>('POST', '/api/admin/regions', { body }),
      get: (id: string) => request<{ region: Region }>('GET', `/api/admin/regions/${enc(id)}`),
      update: (id: string, body: UpdateRegionInput) => request<{ region: Region }>('POST', `/api/admin/regions/${enc(id)}`, { body }),
      remove: (id: string) => request<{ region: Region }>('DELETE', `/api/admin/regions/${enc(id)}`),
    },
    currencies: {
      list: (query?: ListQuery) => request<{ currencies: Currency[] }>('GET', '/api/admin/currencies', { query }),
      get: (code: string) => request<{ currency: Currency }>('GET', `/api/admin/currencies/${enc(code)}`),
    },
    stores: {
      /** Multi-store is out of scope: the list returns the singleton. */
      list: () => request<{ stores: Store[] }>('GET', '/api/admin/stores'),
      get: (id: string) => request<{ store: Store }>('GET', `/api/admin/stores/${enc(id)}`),
      update: (id: string, body: UpdateStoreInput) => request<{ store: Store }>('POST', `/api/admin/stores/${enc(id)}`, { body }),
    },
    salesChannels: {
      list: (query?: ListQuery) => request<{ salesChannels: SalesChannel[] }>('GET', '/api/admin/sales-channels', { query }),
      create: (body: CreateSalesChannelInput) => request<{ salesChannel: SalesChannel }>('POST', '/api/admin/sales-channels', { body }),
      get: (id: string) => request<{ salesChannel: SalesChannel }>('GET', `/api/admin/sales-channels/${enc(id)}`),
      update: (id: string, body: UpdateSalesChannelInput) =>
        request<{ salesChannel: SalesChannel }>('POST', `/api/admin/sales-channels/${enc(id)}`, { body }),
      remove: (id: string) => request<{ salesChannel: SalesChannel }>('DELETE', `/api/admin/sales-channels/${enc(id)}`),
      setProducts: (id: string, body: { productIds: string[] }) =>
        request<{ productIds: string[] }>('POST', `/api/admin/sales-channels/${enc(id)}/products`, { body }),
      listProducts: (id: string) => request<{ productIds: string[] }>('GET', `/api/admin/sales-channels/${enc(id)}/products`),
    },
    apiKeys: {
      list: (query?: ListQuery & { type?: 'publishable' | 'secret' }) => request<{ apiKeys: unknown[] }>('GET', '/api/admin/api-keys', { query }),
      /** The plaintext key is returned ONCE, at creation. */
      create: (body: { name: string; type?: 'publishable' | 'secret'; expiresIn?: number }) =>
        request<{ apiKey: { id: string; key?: string } }>('POST', '/api/admin/api-keys', { body }),
      get: (id: string) => request<{ apiKey: unknown }>('GET', `/api/admin/api-keys/${enc(id)}`),
      revoke: (id: string) => request<{ apiKey: unknown }>('POST', `/api/admin/api-keys/${enc(id)}/revoke`, { body: {} }),
      setSalesChannels: (id: string, body: { salesChannelIds: string[] }) =>
        request<{ salesChannelIds: string[] }>('POST', `/api/admin/api-keys/${enc(id)}/sales-channels`, { body }),
    },

    // --- Utilisateurs & accès ------------------------------------------------
    invites: {
      list: (query?: ListQuery) => request<{ invites: unknown[] }>('GET', '/api/admin/invites', { query }),
      create: (body: { email: string; role: string }) => request<{ invite: { id: string; token?: string } }>('POST', '/api/admin/invites', { body }),
      /** Token-authenticated, not session-authenticated: the invited user calls it. */
      accept: (body: { token: string; name?: string; password: string }) =>
        request<{ user: { id: string; email: string } }>('POST', '/api/admin/invites/accept', { body }),
      get: (id: string) => request<{ invite: unknown }>('GET', `/api/admin/invites/${enc(id)}`),
      remove: (id: string) => request<{ invite: unknown }>('DELETE', `/api/admin/invites/${enc(id)}`),
    },
    users: {
      list: (query?: ListQuery) => request<{ users: unknown[] }>('GET', '/api/admin/users', { query }),
      me: () => request<{ user: { id: string; email: string; role: string } }>('GET', '/api/admin/users/me'),
    },
    auth: {
      signIn: (body: { email: string; password: string }) =>
        request<{ user: { id: string; email: string } }>('POST', '/api/admin/auth/sign-in/email', { body }),
      signOut: () => request<{ success: boolean }>('POST', '/api/admin/auth/sign-out', { body: {} }),
      session: () => request<{ user: { id: string; email: string } } | null>('GET', '/api/admin/auth/get-session'),
    },

    // --- Webhooks & notifications --------------------------------------------
    webhookEndpoints: {
      list: (query?: ListQuery) => request<{ webhookEndpoints: WebhookEndpoint[] }>('GET', '/api/admin/webhook-endpoints', { query }),
      /** The plaintext signing secret is returned ONCE, at creation. */
      create: (body: CreateWebhookEndpointInput) =>
        request<{ webhookEndpoint: WebhookEndpoint & { secret?: string } }>('POST', '/api/admin/webhook-endpoints', { body }),
      get: (id: string) => request<{ webhookEndpoint: WebhookEndpoint }>('GET', `/api/admin/webhook-endpoints/${enc(id)}`),
      update: (id: string, body: UpdateWebhookEndpointInput) =>
        request<{ webhookEndpoint: WebhookEndpoint }>('POST', `/api/admin/webhook-endpoints/${enc(id)}`, { body }),
      remove: (id: string) => request<{ id: string }>('DELETE', `/api/admin/webhook-endpoints/${enc(id)}`),
      rotateSecret: (id: string) =>
        request<{ webhookEndpoint: WebhookEndpoint & { secret?: string } }>('POST', `/api/admin/webhook-endpoints/${enc(id)}/rotate-secret`, {
          body: {},
        }),
    },
    webhookDeliveries: {
      list: (query?: ListQuery & { endpointId?: string; status?: string }) =>
        request<{ webhookDeliveries: WebhookDelivery[] }>('GET', '/api/admin/webhook-deliveries', { query }),
      /** Appends a fresh pending delivery — the original row keeps its outcome. */
      redeliver: (id: string) => request<{ webhookDelivery: WebhookDelivery }>('POST', `/api/admin/webhook-deliveries/${enc(id)}/redeliver`, { body: {} }),
    },
    notifications: {
      list: (query?: ListQuery & { channel?: string; resourceId?: string }) =>
        request<{ notifications: Notification[] }>('GET', '/api/admin/notifications', { query }),
    },
  }
}

export type AdminResources = ReturnType<typeof createAdminResources>
