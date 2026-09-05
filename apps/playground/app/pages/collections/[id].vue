<script setup lang="ts">
const client = usePygmalion()
const route = useRoute()
const { regionId, currencyCode } = useShop()
const { t } = useShopText()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `collection:${id.value}`,
  async () => {
    const [{ collection }, { products }] = await Promise.all([
      client.store.collections.get(id.value),
      client.store.collections.products(id.value, { limit: 48, region_id: regionId.value }),
    ])
    return { collection, products }
  },
  { watch: [regionId, id] },
)

useSeoMeta({ title: () => data.value?.collection.title ?? t('productCollectionFallback') })
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <NuxtLink to="/products" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-highlighted">
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      {{ t('navAllProducts') }}
    </NuxtLink>

    <h1 class="shop-display mt-4 text-3xl text-highlighted sm:text-4xl">
      {{ data?.collection.title ?? t('productCollectionFallback') }}
    </h1>

    <ProductGrid
      class="mt-10"
      :products="data?.products ?? []"
      :currency="currencyCode"
      :pending="pending"
      :error="error"
      :empty-title="t('productCollectionEmptyTitle')"
      :empty-message="t('productCollectionEmptyMessage')"
      @retry="refresh()"
    />
  </div>
</template>
