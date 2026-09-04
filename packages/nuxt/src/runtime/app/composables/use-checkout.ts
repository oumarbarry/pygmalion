import type { CartAddressInput, EligibleShippingOption } from '@oumarbarry/pygmalion-core'
import type { FullOrder, ProviderRef } from '@oumarbarry/pygmalion-sdk'
import { computed } from 'vue'
import { useState } from 'nuxt/app'
import { useCart } from './use-cart'
import { usePygmalion } from './use-pygmalion'

export type CheckoutStep = 'email' | 'address' | 'shipping' | 'payment' | 'done'

/**
 * The checkout, step by step, on top of `useCart`.
 *
 * `step` is derived from the cart itself (email -> address -> shipping ->
 * payment), never from a local wizard state: a reload, a second tab or an SSR
 * render all land on the same step.
 */
export function useCheckout() {
  const client = usePygmalion()
  const { cart, ensure, update, setShipping, refresh, clear } = useCart()
  const shippingOptions = useState<EligibleShippingOption[]>('pygmalion:shipping-options', () => [])
  const paymentProviders = useState<ProviderRef[]>('pygmalion:payment-providers', () => [])
  const order = useState<FullOrder | null>('pygmalion:order', () => null)

  const step = computed<CheckoutStep>(() => {
    if (order.value) return 'done'
    const c = cart.value
    if (!c?.email) return 'email'
    if (!c.shippingCountryCode) return 'address'
    if (!c.shippingMethods.length) return 'shipping'
    return 'payment'
  })

  const setEmail = (email: string) => update({ email })
  const setAddresses = (body: { shippingAddress?: CartAddressInput; billingAddress?: CartAddressInput }) => update(body)

  /** Options eligible for THIS cart (zone + rules + profile), price already resolved. */
  async function loadShippingOptions(): Promise<EligibleShippingOption[]> {
    const current = await ensure()
    shippingOptions.value = (await client.store.shippingOptions.list({ cart_id: current.id })).shippingOptions
    return shippingOptions.value
  }

  const setShippingMethod = (shippingOptionId: string) => setShipping(shippingOptionId)

  /**
   * Payment methods the store actually has (the provider registry). The list is the only
   * honest way for a checkout to offer a choice: `manual` alone in dev, plus
   * `stripe` as soon as `@oumarbarry/pygmalion-stripe` is installed with a secret key.
   */
  async function loadPaymentProviders(): Promise<ProviderRef[]> {
    paymentProviders.value = (await client.store.paymentProviders.list()).paymentProviders
    return paymentProviders.value
  }

  /** Opens a payment collection + its provider session (`manual` by default). */
  async function startPayment(providerId?: string) {
    const current = await ensure()
    return (await client.store.paymentCollections.create({ cartId: current.id, providerId })).paymentCollection
  }

  /**
   * Places the order. On success the cart is dropped (a completed cart must
   * never be reused); on a failed authorization the cart survives and is
   * refreshed so the shopper can retry with another provider.
   */
  async function complete() {
    const current = await ensure()
    const result = await client.store.carts.complete(current.id)
    if (result.type === 'order') {
      order.value = result.order
      clear()
    } else {
      await refresh()
    }
    return result
  }

  return {
    cart,
    order,
    step,
    shippingOptions,
    paymentProviders,
    setEmail,
    setAddresses,
    loadShippingOptions,
    setShippingMethod,
    loadPaymentProviders,
    startPayment,
    complete,
  }
}
