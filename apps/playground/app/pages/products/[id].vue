<script setup lang="ts">
import type { StoreVariant } from '@oumarbarry/pygmalion-sdk'

const client = usePygmalion()
const route = useRoute()
const { regionId, currencyCode, addItem, openDrawer } = useShop()
const { t, tf, money } = useShopText()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `product:${id.value}`,
  () => client.store.products.get(id.value, { region_id: regionId.value }),
  { watch: [regionId, id] },
)

const product = computed(() => data.value?.product ?? null)
const selected = ref<StoreVariant | null>(null)
// A single-variant product has no picker to emit a selection.
watchEffect(() => {
  if (product.value && !product.value.options.length) selected.value = product.value.variants[0] ?? null
})

// The amount is whatever the API resolved for this region — never a
// client-side conversion of a base price.
const price = computed(() => selected.value?.calculatedPrice?.calculatedAmount ?? null)
const canAdd = computed(() => selected.value !== null && price.value !== null)

const adding = ref(false)
const addError = ref('')

async function add() {
  if (!selected.value) return
  adding.value = true
  addError.value = ''
  try {
    // The cart is created on this first click (never during SSR — the httpOnly
    // cart token only reaches the browser through a real response).
    await addItem({ variantId: selected.value.id, quantity: 1 }, { regionId: regionId.value })
    openDrawer()
  } catch (err) {
    addError.value = err instanceof Error ? err.message : String(err)
  } finally {
    adding.value = false
  }
}

useSeoMeta({
  title: () => product.value?.title ?? t('productFallbackTitle'),
  description: () => product.value?.subtitle ?? product.value?.description ?? '',
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <AsyncState
      :pending="pending"
      :error="isNotFound(error) ? null : error"
      :empty="!product"
      :empty-title="t('productNotFoundTitle')"
      :empty-message="t('productNotFoundMessage')"
      @retry="refresh()"
    >
      <template #empty-action>
        <UButton to="/products" class="mt-5" color="neutral" variant="outline" :label="t('commonBackToShop')" />
      </template>

      <div v-if="product" class="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <ProductGallery :images="product.images" :fallback="product.thumbnail" :title="product.title" />

        <div class="lg:pt-4">
          <NuxtLink to="/products" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-highlighted">
            <UIcon name="i-lucide-arrow-left" class="size-4" />
            {{ t('productShopTitle') }}
          </NuxtLink>

          <h1 class="shop-display mt-4 text-3xl text-highlighted sm:text-4xl" data-testid="product-title">
            {{ product.title }}
          </h1>
          <p v-if="product.subtitle" class="mt-2 text-lg text-muted">{{ product.subtitle }}</p>

          <p class="shop-price mt-5 text-3xl text-highlighted" :data-amount="price" data-testid="product-price">
            {{ price === null ? t('productNoPrice') : money(price, currencyCode) }}
          </p>

          <VariantPicker
            v-if="product.options.length"
            v-model="selected"
            class="mt-8"
            :options="product.options"
            :variants="product.variants"
          />

          <!-- Variant ids stay in the markup whatever the picker shows: the SSR
               contract the storefront E2E suite asserts on. -->
          <ul class="sr-only">
            <li v-for="v in product.variants" :key="v.id" :data-variant="v.id">{{ v.title }}</li>
          </ul>

          <!-- Full width where the thumb is (one-handed reach), its own width on
               a pointer screen: a 520px slab of colour is not a better button. -->
          <UButton
            class="mt-8 w-full sm:w-auto sm:min-w-72"
            size="xl"
            color="primary"
            :disabled="!canAdd"
            :loading="adding"
            :leading-icon="adding ? 'i-lucide-loader-circle' : undefined"
            :label="t(canAdd ? 'productAddToCart' : 'productChooseVariant')"
            data-testid="add-to-cart"
            @click="add()"
          />
          <p v-if="addError" class="mt-3 text-sm text-error" role="alert" data-testid="add-error">{{ addError }}</p>

          <p v-if="product.description" class="shop-prose mt-8 leading-relaxed text-toned">{{ product.description }}</p>

          <dl class="mt-8 space-y-2 border-t border-default pt-6 text-sm">
            <div v-if="product.material" class="flex gap-3">
              <dt class="w-28 shrink-0 text-muted">{{ t('productMaterial') }}</dt>
              <dd class="text-toned">{{ product.material }}</dd>
            </div>
            <div v-if="selected?.sku" class="flex gap-3">
              <dt class="w-28 shrink-0 text-muted">{{ t('productSku') }}</dt>
              <dd class="text-toned">{{ selected.sku }}</dd>
            </div>
            <div class="flex gap-3">
              <dt class="w-28 shrink-0 text-muted">{{ t('commonShipping') }}</dt>
              <dd class="text-toned">{{ tf('productShippingInfo', { amount: money(8000, 'eur') }) }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </AsyncState>
  </div>
</template>
