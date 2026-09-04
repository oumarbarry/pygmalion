/**
 * Response/query types shared by the store + admin resources.
 *
 * Entity shapes come from `@oumarbarry/pygmalion-core` (type-only import — see index.ts):
 * the SDK never restates a row it doesn't own. Only what the HTTP layer adds
 * on top (list query params, enriched storefront payloads, envelopes the
 * routes compose ad hoc) is declared here.
 */
import type {
  CalculatedPrice,
  CheckoutService,
  ClaimsService,
  DraftOrdersService,
  ExchangesService,
  OrderEditsService,
  PricingService,
  Product,
  ProductImage,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  ProductsService,
  ReturnsService,
  WebhooksService,
} from '@oumarbarry/pygmalion-core'

/** `utils/list-query.ts` — the uniform `?limit&offset&q&order` of every list route. */
export type ListQuery = {
  limit?: number
  offset?: number
  q?: string
  order?: string
}

/** Storefront price context: a region (its currency) or an explicit currency. */
export type PriceContextQuery = {
  region_id?: string
  currency_code?: string
}

/** A variant as the storefront sees it: the row plus its resolved price. */
export type StoreVariant = ProductVariant & { calculatedPrice: CalculatedPrice | null }

/**
 * `GET /api/store/products/:id` — the product row plus everything a product
 * page needs in one call: priced variants, the image gallery, and the options
 * (with their values) that drive the variant picker.
 */
export type StoreProduct = Product & {
  variants: StoreVariant[]
  images: ProductImage[]
  options: (ProductOption & { values: ProductOptionValue[] })[]
}

/**
 * A row of `GET /api/store/products` (and the collection/category/tag listings).
 * `variants` is present only when the request carried a price context
 * (`region_id` / `currency_code`) — a listing without one still answers, with
 * the bare product rows it always returned.
 */
export type StoreProductListItem = Product & { variants?: StoreVariant[] }

/** `providers.list(type)` — ids only, never provider configuration. */
export type ProviderRef = {
  type: string
  id: string
}

// --- Service-derived results -------------------------------------------------
// Routes that return a service result verbatim (batches, previews, RMA
// creations): deriving the type keeps them exact and free of drift.
export type FullOrder = NonNullable<Awaited<ReturnType<CheckoutService['getOrder']>>>

/**
 * `GET /api/store/orders/:id` — the order plus what a customer self-service
 * page needs: where the shipment stands, and how much of each line is still
 * returnable (`POST /api/store/returns` accepts shipped units only).
 */
export type StoreOrder = Omit<FullOrder, 'items'> & {
  fulfillmentStatus: string
  items: (FullOrder['items'][number] & { returnableQuantity: number })[]
}
export type BatchProductsResult = Awaited<ReturnType<ProductsService['batch']>>
export type BatchVariantsResult = Awaited<ReturnType<ProductsService['variants']['batch']>>
export type BatchPricesResult = Awaited<ReturnType<PricingService['batchPrices']>>
export type PriceListProductsResult = Awaited<ReturnType<PricingService['addProductsToList']>>
export type OrderEditPreview = Awaited<ReturnType<OrderEditsService['preview']>>
export type ReturnResult = Awaited<ReturnType<ReturnsService['request']>>
export type ExchangeResult = Awaited<ReturnType<ExchangesService['create']>>
export type ClaimResult = Awaited<ReturnType<ClaimsService['create']>>
export type FullDraftOrder = NonNullable<Awaited<ReturnType<DraftOrdersService['get']>>>
export type WebhookDeliveryRow = NonNullable<Awaited<ReturnType<WebhooksService['deliveries']['get']>>>
