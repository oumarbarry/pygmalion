<script setup lang="ts">
import type { CartAddressInput } from '@oumarbarry/pygmalion-core'

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

useSeoMeta({ title: 'Commande' })

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
const PROVIDER_LABELS: Record<string, string> = {
  manual: 'Paiement à réception (démo)',
  stripe: 'Carte bancaire (Stripe)',
  'always-fail': 'Paiement refusé (démo — pour tester le refus)',
}
const providerItems = computed(() =>
  paymentProviders.value.map((p) => ({ value: p.id, label: PROVIDER_LABELS[p.id] ?? p.id })),
)

const submitAddress = (address: CartAddressInput) => run(() => setAddresses({ shippingAddress: address }))

const pay = () =>
  run(async () => {
    await startPayment(provider.value)
    const result = await complete()
    if (result.type === 'order') await navigateTo(`/order/${result.order.id}`)
    // `type: 'cart'` = authorization refused; the order was canceled and the
    // cart survives, so the shopper can pick another method and retry.
    else throw new Error("Le paiement n'a pas abouti. Choisissez un autre moyen de paiement et réessayez.")
  })

const currency = computed(() => cart.value?.currencyCode)
const isEmpty = computed(() => !cart.value?.items.length && step.value !== 'done')
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <h1 class="shop-display text-3xl text-highlighted sm:text-4xl">Votre commande</h1>

    <div v-if="isEmpty" class="mt-8 rounded-xl border border-dashed border-default px-6 py-14 text-center">
      <UIcon name="i-lucide-shopping-bag" class="mx-auto size-8 text-dimmed" />
      <p class="mt-4 font-semibold text-highlighted">Il n'y a rien à commander</p>
      <p class="mt-1.5 text-sm text-muted">Ajoutez un objet au panier pour continuer.</p>
      <UButton to="/products" class="mt-5" color="primary" label="Voir la boutique" />
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

        <!-- 1. Coordonnées ------------------------------------------------- -->
        <section v-if="step === 'email'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">Vos coordonnées</h2>
          <p class="mt-1 text-sm text-muted">
            Nous n'envoyons que la confirmation et le suivi.
            <template v-if="!isAuthenticated">
              <NuxtLink to="/account/login?redirect=/checkout" class="underline underline-offset-2 hover:text-highlighted">
                Se connecter
              </NuxtLink>
              pour retrouver ses adresses.
            </template>
          </p>
          <form class="mt-5 max-w-sm space-y-4" @submit.prevent="run(() => setEmail(email))">
            <UFormField label="Adresse e-mail" required>
              <UInput v-model="email" type="email" autocomplete="email" required class="w-full" data-testid="email" />
            </UFormField>
            <UButton
              type="submit"
              size="lg"
              color="primary"
              class="w-full sm:w-auto"
              :loading="busy"
              label="Continuer"
              data-testid="email-submit"
            />
          </form>
        </section>

        <!-- 2. Adresse ------------------------------------------------------ -->
        <section v-else-if="step === 'address'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">Adresse de livraison</h2>
          <p class="mt-1 text-sm text-muted">Commande pour {{ cart?.email }}</p>
          <CheckoutAddressForm
            class="mt-5 max-w-lg"
            :saved="addresses"
            :countries="countries ?? []"
            :busy="busy"
            @submit="submitAddress"
          />
        </section>

        <!-- 3. Livraison ---------------------------------------------------- -->
        <section v-else-if="step === 'shipping'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">Mode de livraison</h2>
          <AsyncState
            class="mt-5"
            :pending="busy && !shippingOptions.length"
            :empty="!busy && !shippingOptions.length"
            empty-title="Aucune livraison possible ici"
            empty-message="Nous ne desservons pas encore cette adresse. Modifiez-la pour continuer."
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
                    {{ formatMoney(option.amount, currency) }}
                  </span>
                </button>
              </li>
            </ul>
          </AsyncState>
        </section>

        <!-- 4. Paiement ----------------------------------------------------- -->
        <section v-else-if="step === 'payment'" class="mt-8">
          <h2 class="text-lg font-bold text-highlighted">Paiement</h2>
          <p class="mt-1 text-sm text-muted">
            Livré à {{ cart?.shippingCity }} · {{ cart?.shippingMethods[0]?.name }}
          </p>

          <fieldset class="mt-5 max-w-lg space-y-3">
            <legend class="sr-only">Moyen de paiement</legend>
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
            Le paiement passe par Stripe. Le montant est seulement autorisé maintenant — il n'est débité qu'à
            l'expédition.
          </p>

          <UButton
            class="mt-8 w-full sm:w-auto"
            size="xl"
            color="primary"
            :loading="busy"
            :leading-icon="busy ? 'i-lucide-loader-circle' : undefined"
            :label="`Payer ${formatMoney(cart?.total ?? 0, currency)}`"
            data-testid="pay"
            @click="pay()"
          />
          <p class="mt-3 max-w-lg text-xs text-dimmed">
            En validant, vous acceptez que votre commande soit préparée et expédiée à l'adresse indiquée.
          </p>
        </section>

        <!-- The order exists: /order/:id is the confirmation. -->
        <section v-else class="mt-8">
          <p class="text-muted">Commande enregistrée.</p>
          <UButton v-if="order" :to="`/order/${order.id}`" class="mt-4" color="primary" label="Voir la confirmation" />
        </section>
      </div>

      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div class="rounded-xl border border-default p-5">
          <h2 class="text-sm font-semibold text-highlighted">Votre panier</h2>
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
              <span class="shop-num text-toned">{{ formatMoney(line.total, currency) }}</span>
            </li>
          </ul>
          <!-- "calculée à l'étape suivante" is only true while livraison IS the
               next step; on the shipping step itself the price is on screen. -->
          <CartTotals
            class="mt-5 border-t border-default pt-5"
            :cart="cart"
            :show-shipping-hint="step === 'email' || step === 'address'"
          />
        </div>
        <NuxtLink to="/cart" class="mt-4 block text-center text-sm text-muted hover:text-highlighted">
          Modifier le panier
        </NuxtLink>
      </aside>
    </div>
  </div>
</template>
