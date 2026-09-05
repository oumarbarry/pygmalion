<script setup lang="ts">
import type { CartAddressInput } from '@oumarbarry/pygmalion-core'
import type { ShopTextKey } from '../utils/shop-text'

/**
 * The checkout. `step` is DERIVED from the cart by `useCheckout`, never from a
 * local wizard state: a reload, a second tab or an SSR render all land on the
 * same step. This page only renders the current step and moves it forward.
 */
const client = usePygmalion()
const {
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
} = useCheckout()
const { customer, isAuthenticated, region, attachCustomer } = useShop()
const { addresses, refreshAddresses } = useCustomer()
const { t, tf, money } = useShopText()

useSeoMeta({ title: () => t('checkoutTitle') })

const busy = ref(false)
const error = ref('')

async function run(action: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

// The region's own countries scope the address form: a shopper can't pick a
// destination no shipping option covers.
const { data: countries } = await useAsyncData(
  () => `checkout:countries:${region.value?.id ?? 'none'}`,
  async () => {
    if (!region.value) return []
    const { region: full } = await client.store.regions.get(region.value.id)
    // The row already carries a display name — no Intl.DisplayNames guesswork.
    return full.countries.map((c) => ({ code: c.iso2.toLowerCase(), label: c.displayName }))
  },
  { watch: [region] },
)

const email = ref('')
onMounted(async () => {
  if (!isAuthenticated.value) return
  email.value = customer.value?.email ?? ''
  // Bind the guest cart to the account BEFORE it becomes an order, or the
  // order lands under no customer and never shows in "mes commandes".
  await Promise.all([refreshAddresses(), attachCustomer().catch(() => null)])
})

// Each step fetches what it needs the moment it becomes current.
watch(
  step,
  (s) => {
    if (s === 'shipping' && !shippingOptions.value.length) run(loadShippingOptions)
    if (s === 'payment' && !paymentProviders.value.length) run(loadPaymentProviders)
  },
  { immediate: true },
)

const provider = ref('manual')
watchEffect(() => {
  // `manual` is always registered (dev default); honour a store that only has
  // a real provider installed.
  const ids = paymentProviders.value.map((p) => p.id)
  if (ids.length && !ids.includes(provider.value)) provider.value = ids.includes('manual') ? 'manual' : ids[0]
})
/**
 * Provider ids are the registry's vocabulary, never the shopper's (§S7): every
 * registered provider gets a sentence here, including the demo module's
 * `always-fail` — it exists to exercise the refusal path, and a shopper who
 * picks it should know that's what they're doing.
 */
const PROVIDER_LABELS: Record<string, ShopTextKey> = {
  manual: 'checkoutProviderManual',
  stripe: 'checkoutProviderStripe',
  'always-fail': 'checkoutProviderAlwaysFail',
}
const providerItems = computed(() =>
  paymentProviders.value.map((p) => {
    const key = PROVIDER_LABELS[p.id]
    return { value: p.id, label: key ? t(key) : p.id }
  }),
)

const submitAddress = (address: CartAddressInput) => run(() => setAddresses({ shippingAddress: address }))

const pay = () =>
  run(async () => {
    await startPayment(provider.value)
    const result = await complete()
    if (result.type === 'order') await navigateTo(`/order/${result.order.id}`)
    // `type: 'cart'` = authorization refused; the order was canceled and the
    // cart survives, so the shopper can pick another method and retry.
    else throw new Error(t('checkoutPaymentFailed'))
  })

const currency = computed(() => cart.value?.currencyCode)
const isEmpty = computed(() => !cart.value?.items.length && step.value !== 'done')
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <h1 class="shop-display text-3xl text-highlighted sm:text-4xl">{{ t('orderTitle') }}</h1>

    <div v-if="isEmpty" class="mt-8 rounded-xl border border-dashed border-default px-6 py-14 text-center">
      <UIcon name="i-lucide-shopping-bag" class="mx-auto size-8 text-dimmed" />
      <p class="mt-4 font-semibold text-highlighted">{{ t('checkoutEmptyTitle') }}</p>
      <p class="mt-1.5 text-sm text-muted">{{ t('checkoutEmptyMessage') }}</p>
      <UButton to="/products" class="mt-5" color="primary" :label="t('commonBrowseShop')" />
      <p class="sr-only" data-testid="step">{{ step }}</p>
    </div>

    <div v-else class="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
      <div>
        <CheckoutProgress :step="step" />
        <p class="sr-only" data-testid="step">{{ step }}</p>

        <p
          v-if="error"
          class="mt-6 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
          role="alert"
          data-testid="checkout-error"
        >
          {{ error }}
        </p>

        <!-- 1. Contact --------------------------------------------------- -->
        <section v-if="step === 'email'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">{{ t('checkoutContactTitle') }}</h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('checkoutContactText') }}
            <template v-if="!isAuthenticated">
              <NuxtLink to="/account/login?redirect=/checkout" class="underline underline-offset-2 hover:text-highlighted">
                {{ t('accountSignIn') }}
              </NuxtLink>
              {{ t('checkoutSignInHint') }}
            </template>
          </p>
          <form class="mt-5 max-w-sm space-y-4" @submit.prevent="run(() => setEmail(email))">
            <UFormField :label="t('commonEmail')" required>
              <UInput v-model="email" type="email" autocomplete="email" required class="w-full" data-testid="email" />
            </UFormField>
            <UButton
              type="submit"
              size="lg"
              color="primary"
              class="w-full sm:w-auto"
              :loading="busy"
              :label="t('commonContinue')"
              data-testid="email-submit"
            />
          </form>
        </section>

        <!-- 2. Address --------------------------------------------------- -->
        <section v-else-if="step === 'address'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">{{ t('checkoutAddressTitle') }}</h2>
          <p class="mt-1 text-sm text-muted">{{ tf('checkoutOrderFor', { email: cart?.email ?? '' }) }}</p>
          <CheckoutAddressForm
            class="mt-5 max-w-lg"
            :saved="addresses"
            :countries="countries ?? []"
            :busy="busy"
            @submit="submitAddress"
          />
        </section>

        <!-- 3. Shipping -------------------------------------------------- -->
        <section v-else-if="step === 'shipping'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">{{ t('checkoutShippingTitle') }}</h2>
          <AsyncState
            class="mt-5"
            :pending="busy && !shippingOptions.length"
            :empty="!busy && !shippingOptions.length"
            :empty-title="t('checkoutNoShippingTitle')"
            :empty-message="t('checkoutNoShippingMessage')"
            empty-icon="i-lucide-truck"
            @retry="run(loadShippingOptions)"
          >
            <ul class="max-w-lg space-y-3">
              <li v-for="option in shippingOptions" :key="option.id">
                <button
                  type="button"
                  class="flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border border-default px-5 py-4 text-left transition-colors hover:border-accented hover:bg-muted/50 disabled:opacity-50"
                  :disabled="busy"
                  :data-shipping-option="option.id"
                  @click="run(() => setShippingMethod(option.id))"
                >
                  <span class="font-medium text-highlighted">{{ option.name }}</span>
                  <span class="shop-num font-semibold text-toned" :data-amount="option.amount">
                    {{ money(option.amount, currency) }}
                  </span>
                </button>
              </li>
            </ul>
          </AsyncState>
        </section>

        <!-- 4. Payment --------------------------------------------------- -->
        <section v-else-if="step === 'payment'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">{{ t('checkoutStepPayment') }}</h2>
          <p class="mt-1 text-sm text-muted">
            {{ tf('checkoutShipTo', { city: cart?.shippingCity ?? '', method: cart?.shippingMethods[0]?.name ?? '' }) }}
          </p>

          <fieldset class="mt-5 max-w-lg space-y-3">
            <legend class="sr-only">{{ t('checkoutPaymentMethod') }}</legend>
            <label
              v-for="p in providerItems"
              :key="p.value"
              class="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-5 py-4 transition-colors"
              :class="provider === p.value ? 'border-inverted bg-muted/50' : 'border-default hover:border-accented'"
            >
              <input v-model="provider" type="radio" :value="p.value" name="payment-provider" class="size-4">
              <span class="font-medium text-highlighted">{{ p.label }}</span>
            </label>
          </fieldset>

          <p v-if="provider === 'stripe'" class="mt-4 max-w-lg text-sm text-muted">
            {{ t('checkoutStripeNote') }}
          </p>

          <UButton
            class="mt-8 w-full sm:w-auto"
            size="xl"
            color="primary"
            :loading="busy"
            :leading-icon="busy ? 'i-lucide-loader-circle' : undefined"
            :label="tf('checkoutPay', { amount: money(cart?.total ?? 0, currency) })"
            data-testid="pay"
            @click="pay()"
          />
          <p class="mt-3 max-w-lg text-xs text-dimmed">
            {{ t('checkoutConsent') }}
          </p>
        </section>

        <!-- The order exists: /order/:id is the confirmation. -->
        <section v-else class="mt-8">
          <p class="text-muted">{{ t('checkoutDone') }}</p>
          <UButton v-if="order" :to="`/order/${order.id}`" class="mt-4" color="primary" :label="t('checkoutSeeConfirmation')" />
        </section>
      </div>

      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div class="rounded-xl border border-default p-5">
          <h2 class="text-sm font-semibold text-highlighted">{{ t('checkoutYourCart') }}</h2>
          <ul class="mt-4 space-y-3">
            <li v-for="line in cart?.items ?? []" :key="line.id" class="flex gap-3 text-sm">
              <img
                v-if="line.thumbnail"
                :src="line.thumbnail"
                alt=""
                width="48"
                height="60"
                class="shop-media h-15 w-12 shrink-0 rounded object-cover"
              >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-highlighted">{{ line.title }}</span>
                <span class="text-muted">× {{ line.quantity }}</span>
              </span>
              <span class="shop-num text-toned">{{ money(line.total, currency) }}</span>
            </li>
          </ul>
          <!-- "calculated at the next step" is only true while shipping IS the
               next step; on the shipping step itself the price is on screen. -->
          <CartTotals
            class="mt-5 border-t border-default pt-5"
            :cart="cart"
            :show-shipping-hint="step === 'email' || step === 'address'"
          />
        </div>
        <NuxtLink to="/cart" class="mt-4 block text-center text-sm text-muted hover:text-highlighted">
          {{ t('checkoutEditCart') }}
        </NuxtLink>
      </aside>
    </div>
  </div>
</template>
