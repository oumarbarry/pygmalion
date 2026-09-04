import type { AddLineItemInput, CreateCartInput, FullCart } from '@oumarbarry/pygmalion-core'
import { PygmalionError, type UpdateCartInput } from '@oumarbarry/pygmalion-sdk'
import { computed } from 'vue'
import { useCookie, useState } from 'nuxt/app'
import { usePygmalion } from './use-pygmalion'

/** Our own cookie: the cart *id* (URLs), next to the server's httpOnly cart *token* (authorization). */
const CART_ID_COOKIE = 'pygmalion_cart'

/**
 * The storefront cart: shared state + the mutations a shop needs.
 *
 * Identity is split like the server splits it (`utils/cart.ts`): the opaque
 * token stays httpOnly (set by `POST /api/store/carts`, replayed by the browser
 * or forwarded by SSR), and only the cart id is kept in a readable cookie so a
 * reload can fetch the cart again.
 */
export function useCart() {
  const client = usePygmalion()
  const cart = useState<FullCart | null>('pygmalion:cart', () => null)
  const cartId = useCookie<string | null>(CART_ID_COOKIE, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  /** Re-read the cart behind the cookie. A cart the caller may no longer touch (404) drops the cookie. */
  async function refresh(): Promise<FullCart | null> {
    if (!cartId.value) {
      cart.value = null
      return null
    }
    try {
      cart.value = (await client.store.carts.get(cartId.value)).cart
    } catch (err) {
      if (err instanceof PygmalionError && err.status === 404) {
        cartId.value = null
        cart.value = null
      } else throw err
    }
    return cart.value
  }

  /**
   * The cart, created on first need, never before (an empty cart per visitor
   * is a row nobody asked for).
   *
   * Deliberately client-side creation. `Set-Cookie` from an SSR-internal call
   * never reaches the browser, so the cart token would be lost; every caller
   * here is a user interaction (add to cart), which runs in the browser.
   */
  async function ensure(input?: CreateCartInput): Promise<FullCart> {
    if (cart.value) return cart.value
    if (cartId.value && (await refresh())) return cart.value!
    const created = (await client.store.carts.create(input)).cart
    cartId.value = created.id
    cart.value = created
    return created
  }

  async function addItem(input: AddLineItemInput, cartInput?: CreateCartInput): Promise<FullCart> {
    const current = await ensure(cartInput)
    cart.value = (await client.store.carts.addLineItem(current.id, input)).cart
    return cart.value
  }

  async function updateItem(lineId: string, quantity: number): Promise<FullCart> {
    const current = await ensure()
    cart.value = (await client.store.carts.updateLineItem(current.id, lineId, { quantity })).cart
    return cart.value
  }

  async function removeItem(lineId: string): Promise<FullCart> {
    const current = await ensure()
    cart.value = (await client.store.carts.removeLineItem(current.id, lineId)).cart
    return cart.value
  }

  /** Email and/or shipping/billing addresses — the checkout's first two steps. */
  async function update(body: UpdateCartInput): Promise<FullCart> {
    const current = await ensure()
    cart.value = (await client.store.carts.update(current.id, body)).cart
    return cart.value
  }

  async function setShipping(shippingOptionId: string): Promise<FullCart> {
    const current = await ensure()
    cart.value = (await client.store.carts.setShippingMethod(current.id, { shippingOptionId })).cart
    return cart.value
  }

  /**
   * Applies a discount code. The server re-runs the whole totals pipeline, so
   * the returned cart already carries the new `discountTotal`; nothing is
   * computed here (amounts come from the API, never from the client).
   *
   * A code the promotion engine refuses comes back as a `PygmalionError` for
   * the caller to show: silently swallowing it would leave a shopper staring
   * at an unchanged total with no explanation.
   */
  async function applyPromoCode(code: string): Promise<FullCart> {
    const current = await ensure()
    cart.value = (await client.store.carts.addPromotions(current.id, { promotionCodes: [code] })).cart
    return cart.value
  }

  async function removePromoCode(code: string): Promise<FullCart> {
    const current = await ensure()
    cart.value = (await client.store.carts.removePromotions(current.id, { promotionCodes: [code] })).cart
    return cart.value
  }

  /**
   * Binds a guest cart to the customer who just signed in — otherwise the
   * order they are about to place lands under no account and never shows up in
   * "mes commandes". Requires a customer session.
   */
  async function attachCustomer(): Promise<FullCart | null> {
    if (!cartId.value) return null
    cart.value = (await client.store.carts.transferToCustomer(cartId.value)).cart
    return cart.value
  }

  /** Called by `useCheckout` once the order exists: the cart must not be reused. */
  function clear(): void {
    cart.value = null
    cartId.value = null
  }

  return {
    cart,
    cartId,
    itemCount: computed(() => cart.value?.items.reduce((n, i) => n + i.quantity, 0) ?? 0),
    /** Codes currently on the cart, deduped — what the cart UI lists as removable chips. */
    promoCodes: computed(() => [
      ...new Set(
        cart.value?.items
          .flatMap((i) => i.adjustments)
          .map((a) => a.code)
          .filter((c): c is string => !!c) ?? [],
      ),
    ]),
    refresh,
    ensure,
    addItem,
    updateItem,
    removeItem,
    update,
    setShipping,
    applyPromoCode,
    removePromoCode,
    attachCustomer,
    clear,
  }
}
