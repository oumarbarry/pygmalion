<script setup lang="ts">
// useCart resolves the cart from the cookies alone: our readable `pygmalion_cart`
// (the id) plus the server's httpOnly token, forwarded by SSR. The layout has
// already refreshed it — this page renders the same shared state, in full.
const { cart, itemCount, promoCodes, updateItem, removeItem, applyPromoCode, removePromoCode } = useShop()

useSeoMeta({ title: 'Panier' })

const busy = ref(false)
const code = ref('')
const codeError = ref('')

async function run(action: () => Promise<unknown>, onError?: (m: string) => void) {
  busy.value = true
  try {
    await action()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (onError) onError(message)
    else console.error(message)
  } finally {
    busy.value = false
  }
}

function submitCode() {
  const value = code.value.trim()
  if (!value) return
  codeError.value = ''
  run(
    async () => {
      await applyPromoCode(value)
      code.value = ''
    },
    (m) => (codeError.value = m),
  )
}

const currency = computed(() => cart.value?.currencyCode)
const lines = computed(() => cart.value?.items ?? [])
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <h1 class="shop-display text-3xl text-highlighted sm:text-4xl">
      Panier <span v-if="itemCount" class="font-normal text-muted">({{ itemCount }})</span>
    </h1>

    <AsyncState
      class="mt-8"
      :empty="!lines.length"
      empty-title="Votre panier est vide"
      empty-message="Parcourez la boutique : tout ce que vous ajoutez vous attendra ici."
      empty-icon="i-lucide-shopping-bag"
    >
      <template #empty-action>
        <UButton to="/products" class="mt-5" color="primary" label="Voir la boutique" />
      </template>

      <div class="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <ul class="divide-y divide-default border-y border-default">
          <li v-for="line in lines" :key="line.id" class="flex gap-4 py-5 sm:gap-6" data-testid="cart-line">
            <NuxtLink v-if="line.productId" :to="`/products/${line.productId}`" class="shrink-0">
              <img
                v-if="line.thumbnail"
                :src="line.thumbnail"
                :alt="line.title"
                width="96"
                height="120"
                class="shop-media h-30 w-24 rounded-lg object-cover"
              >
            </NuxtLink>

            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="line.productId ? `/products/${line.productId}` : '/products'"
                class="font-semibold text-highlighted hover:underline underline-offset-4"
              >
                {{ line.title }}
              </NuxtLink>
              <p v-if="line.sku" class="mt-0.5 text-sm text-dimmed">{{ line.sku }}</p>
              <p class="shop-num mt-1 text-sm text-muted">{{ formatMoney(line.unitPrice, currency) }} l'unité</p>

              <div class="mt-3 flex flex-wrap items-center gap-3">
                <QuantityStepper
                  :quantity="line.quantity"
                  :disabled="busy"
                  :label="`Quantité pour ${line.title}`"
                  @update="run(() => updateItem(line.id, $event))"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  label="Retirer"
                  :disabled="busy"
                  @click="run(() => removeItem(line.id))"
                />
              </div>
            </div>

            <div class="text-right">
              <p class="shop-price text-highlighted" :data-amount="line.total">
                {{ formatMoney(line.total, currency) }}
              </p>
              <p v-if="line.discountTotal > 0" class="shop-num mt-1 text-sm text-primary">
                −{{ formatMoney(line.discountTotal, currency) }}
              </p>
            </div>
          </li>
        </ul>

        <aside class="lg:sticky lg:top-24 lg:self-start">
          <div class="rounded-xl border border-default p-5">
            <h2 class="text-sm font-semibold text-highlighted">Récapitulatif</h2>

            <form class="mt-4 flex gap-2" @submit.prevent="submitCode">
              <UInput
                v-model="code"
                placeholder="Code promo"
                size="sm"
                class="flex-1"
                aria-label="Code promo"
                data-testid="promo-input"
              />
              <UButton type="submit" size="sm" color="neutral" variant="outline" label="Appliquer" :loading="busy" />
            </form>
            <p v-if="codeError" class="mt-2 text-xs text-error" role="alert" data-testid="promo-error">{{ codeError }}</p>
            <ul v-if="promoCodes.length" class="mt-2.5 flex flex-wrap gap-1.5">
              <li v-for="c in promoCodes" :key="c">
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  trailing-icon="i-lucide-x"
                  :label="c"
                  :aria-label="`Retirer le code ${c}`"
                  data-testid="promo-chip"
                  @click="run(() => removePromoCode(c))"
                />
              </li>
            </ul>

            <CartTotals class="mt-5" :cart="cart" show-shipping-hint />

            <UButton to="/checkout" block size="lg" color="primary" label="Commander" class="mt-5" data-testid="to-checkout" />
          </div>
          <NuxtLink to="/products" class="mt-4 block text-center text-sm text-muted hover:text-highlighted">
            Continuer mes achats
          </NuxtLink>
        </aside>
      </div>
    </AsyncState>
  </div>
</template>
