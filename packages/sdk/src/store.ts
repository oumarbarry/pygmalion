/**
 * Store surface (`/api/store/**` + the customer auth namespace `/api/auth/**`).
 *
 * One method = one route. Paths/methods mirror `packages/nuxt/src/module.ts`
 * (`routes.test.ts` proves it); bodies are sent verbatim — no reshaping, no
 * business logic, the API validates.
 */
import type {
  AddLineItemInput,
  CartPromotionCodesInput,
  CompleteStatus,
  CreateCartInput,
  CreateCustomerAddressInput,
  Currency,
  CustomerAddress,
  CustomerUser,
  EligibleShippingOption,
  FullCart,
  Order,
  PaymentCollection,
  PaymentSession,
  ProductCategory,
  ProductCollection,
  ProductTag,
  Region,
  RegionCountry,
  ReturnReason,
  SetCartAddressesInput,
  SetShippingMethodInput,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
  UpdateLineItemInput,
} from '@oumarbarry/pygmalion-core'
import type { RequestFn } from './client'
import type {
  ListQuery,
  PriceContextQuery,
  ProviderRef,
  StoreOrder,
  StoreProduct,
  StoreProductListItem,
  StoreVariant,
  FullOrder,
} from './types'

/** `POST /api/store/carts/:id` — email and/or addresses, either half optional. */
export type UpdateCartInput = { email?: string } & SetCartAddressesInput

/** `POST /api/store/returns` — deliberately narrower than the admin input (no money, no location). */
export interface StoreReturnInput {
  orderId: string
  email?: string
  items: { lineItemId: string; quantity: number; reasonId?: string | null; note?: string | null }[]
}

export interface EmailPasswordInput {
  email: string
  password: string
  name?: string
}

const enc = encodeURIComponent

export function createStoreResources(request: RequestFn) {
  return {
    // --- Catalogue -----------------------------------------------------------
    products: {
      list: (
        query?: ListQuery &
          PriceContextQuery & { 'collection_id[]'?: string[]; 'category_id[]'?: string[]; 'tag_id[]'?: string[] },
      ) => request<{ products: StoreProductListItem[] }>('GET', '/api/store/products', { query }),
      get: (id: string, query?: PriceContextQuery) =>
        request<{ product: StoreProduct }>('GET', `/api/store/products/${enc(id)}`, { query }),
    },
    variants: {
      list: (query: PriceContextQuery & { product_id: string }) =>
        request<{ variants: StoreVariant[] }>('GET', '/api/store/product-variants', { query }),
    },
    collections: {
      list: (query?: ListQuery) => request<{ collections: ProductCollection[] }>('GET', '/api/store/collections', { query }),
      get: (id: string) => request<{ collection: ProductCollection }>('GET', `/api/store/collections/${enc(id)}`),
      products: (id: string, query?: ListQuery & PriceContextQuery) =>
        request<{ products: StoreProductListItem[] }>('GET', `/api/store/collections/${enc(id)}/products`, { query }),
    },
    categories: {
      list: (query?: ListQuery) => request<{ categories: ProductCategory[] }>('GET', '/api/store/product-categories', { query }),
      get: (id: string) => request<{ category: ProductCategory }>('GET', `/api/store/product-categories/${enc(id)}`),
      products: (id: string, query?: ListQuery & PriceContextQuery) =>
        request<{ products: StoreProductListItem[] }>('GET', `/api/store/product-categories/${enc(id)}/products`, { query }),
    },
    tags: {
      list: (query?: ListQuery) => request<{ tags: ProductTag[] }>('GET', '/api/store/product-tags', { query }),
      get: (id: string) => request<{ tag: ProductTag }>('GET', `/api/store/product-tags/${enc(id)}`),
      products: (id: string, query?: ListQuery & PriceContextQuery) =>
        request<{ products: StoreProductListItem[] }>('GET', `/api/store/product-tags/${enc(id)}/products`, { query }),
    },

    // --- Référentiels --------------------------------------------------------
    regions: {
      list: (query?: ListQuery) => request<{ regions: Region[] }>('GET', '/api/store/regions', { query }),
      /** Detail carries the region's countries — what a checkout's country select needs. */
      get: (id: string) => request<{ region: Region & { countries: RegionCountry[] } }>('GET', `/api/store/regions/${enc(id)}`),
    },
    currencies: {
      list: (query?: ListQuery) => request<{ currencies: Currency[] }>('GET', '/api/store/currencies', { query }),
      get: (code: string) => request<{ currency: Currency }>('GET', `/api/store/currencies/${enc(code)}`),
    },

    // --- Panier --------------------------------------------------------------
    carts: {
      /** Sets the httpOnly cart-token cookie in the response — a browser keeps it on its own. */
      create: (body?: CreateCartInput) => request<{ cart: FullCart }>('POST', '/api/store/carts', { body: body ?? {} }),
      get: (id: string) => request<{ cart: FullCart }>('GET', `/api/store/carts/${enc(id)}`),
      update: (id: string, body: UpdateCartInput) => request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}`, { body }),
      addLineItem: (id: string, body: AddLineItemInput) =>
        request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}/line-items`, { body }),
      updateLineItem: (id: string, lineId: string, body: UpdateLineItemInput) =>
        request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}/line-items/${enc(lineId)}`, { body }),
      removeLineItem: (id: string, lineId: string) =>
        request<{ cart: FullCart }>('DELETE', `/api/store/carts/${enc(id)}/line-items/${enc(lineId)}`),
      /**
       * `shippingOptionId`, spelled exactly as `setShippingMethodInput`
       * validates it. It used to be sent as `optionId` and every call 422'd
       * with "Invalid shipping method" — nothing caught it because the one
       * suite that touched this route ran against a store with no eligible
       * option, so the call was skipped.
       */
      setShippingMethod: (id: string, body: SetShippingMethodInput) =>
        request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}/shipping-methods`, { body }),
      recalcTaxes: (id: string) => request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}/taxes`),
      /** Attach the signed-in customer to a guest cart (session required). */
      transferToCustomer: (id: string) => request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}/customer`),
      addPromotions: (id: string, body: CartPromotionCodesInput) =>
        request<{ cart: FullCart }>('POST', `/api/store/carts/${enc(id)}/promotions`, { body }),
      removePromotions: (id: string, body: CartPromotionCodesInput) =>
        request<{ cart: FullCart }>('DELETE', `/api/store/carts/${enc(id)}/promotions`, { body }),
      /** `type: 'order'` on success, `'cart'` when authorization failed (the order is canceled). */
      complete: (id: string) =>
        request<{ type: 'order' | 'cart'; status: CompleteStatus; order: FullOrder }>('POST', `/api/store/carts/${enc(id)}/complete`),
    },

    // --- Expédition + paiement ----------------------------------------------
    shippingOptions: {
      list: (query: { cart_id: string }) =>
        request<{ shippingOptions: EligibleShippingOption[] }>('GET', '/api/store/shipping-options', { query }),
    },
    paymentProviders: {
      list: () => request<{ paymentProviders: ProviderRef[] }>('GET', '/api/store/payment-providers'),
    },
    paymentCollections: {
      /** Creates the collection AND its first provider session in one call. */
      create: (body: { cartId: string; providerId?: string }) =>
        request<{ paymentCollection: PaymentCollection }>('POST', '/api/store/payment-collections', { body }),
      /** Another session on an existing collection: switch provider, retry after a failure. */
      createSession: (id: string, body?: { providerId?: string }) =>
        request<{ paymentSession: PaymentSession }>('POST', `/api/store/payment-collections/${enc(id)}/payment-sessions`, {
          body: body ?? {},
        }),
    },

    // --- Client (self-service) ----------------------------------------------
    customers: {
      me: () => request<{ customer: CustomerUser }>('GET', '/api/store/customers/me'),
      update: (body: UpdateCustomerInput) => request<{ customer: CustomerUser }>('PATCH', '/api/store/customers/me', { body }),
      addresses: {
        list: () => request<{ addresses: CustomerAddress[] }>('GET', '/api/store/customers/me/addresses'),
        create: (body: CreateCustomerAddressInput) =>
          request<{ address: CustomerAddress }>('POST', '/api/store/customers/me/addresses', { body }),
        get: (id: string) => request<{ address: CustomerAddress }>('GET', `/api/store/customers/me/addresses/${enc(id)}`),
        update: (id: string, body: UpdateCustomerAddressInput) =>
          request<{ address: CustomerAddress }>('PATCH', `/api/store/customers/me/addresses/${enc(id)}`, { body }),
        remove: (id: string) => request<{ address: CustomerAddress }>('DELETE', `/api/store/customers/me/addresses/${enc(id)}`),
      },
    },

    // --- Commandes + retours -------------------------------------------------
    orders: {
      list: (query?: ListQuery) => request<{ orders: Order[] }>('GET', '/api/store/orders', { query }),
      /** Guests pass `?email=` (the address that placed the order); customers use their session. */
      get: (id: string, query?: { email?: string }) => request<{ order: StoreOrder }>('GET', `/api/store/orders/${enc(id)}`, { query }),
    },
    returnReasons: {
      list: (query?: ListQuery) => request<{ returnReasons: ReturnReason[] }>('GET', '/api/store/return-reasons', { query }),
      get: (id: string) => request<{ returnReason: ReturnReason }>('GET', `/api/store/return-reasons/${enc(id)}`),
    },
    returns: {
      create: (body: StoreReturnInput) => request<{ return: unknown }>('POST', '/api/store/returns', { body }),
    },

    // --- Auth client (better-auth) -------------------------------------------
    // Thin passthrough over the `/api/auth/**` catch-all: the SDK stays
    // dependency-free rather than pulling better-auth's own client, and the
    // session lives in the cookie the server sets either way.
    auth: {
      signUp: (body: EmailPasswordInput) => request<{ user: { id: string; email: string } }>('POST', '/api/auth/sign-up/email', { body }),
      signIn: (body: EmailPasswordInput) => request<{ user: { id: string; email: string } }>('POST', '/api/auth/sign-in/email', { body }),
      signOut: () => request<{ success: boolean }>('POST', '/api/auth/sign-out', { body: {} }),
      session: () => request<{ user: { id: string; email: string } } | null>('GET', '/api/auth/get-session'),
    },
  }
}

export type StoreResources = ReturnType<typeof createStoreResources>
