<script setup lang="ts">
const client = usePygmalion()
const route = useRoute()
const router = useRouter()
const { regionId, currencyCode, collections, categories } = useShop()
const { t, tf, one } = useShopText()

useSeoMeta({ title: () => t('productShopTitle'), description: () => t('productShopDescription') })

/**
 * Filters live in the URL, not in local state: a filtered listing is a page
 * someone shares, bookmarks and reloads. The query IS the source of truth and
 * `useAsyncData` watches it.
 */
const q = computed({
  get: () => String(route.query.q ?? ''),
  set: (v) => setQuery({ q: v || undefined }),
})
const collectionId = computed(() => (route.query.collection ? String(route.query.collection) : undefined))
const categoryId = computed(() => (route.query.category ? String(route.query.category) : undefined))

function setQuery(patch: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...patch } })
}
const clearFilters = () => router.replace({ query: {} })
const hasFilters = computed(() => Boolean(q.value || collectionId.value || categoryId.value))

const { data, pending, error, refresh } = await useAsyncData(
  'products:list',
  () =>
    client.store.products.list({
      limit: 48,
      region_id: regionId.value,
      q: q.value || undefined,
      'collection_id[]': collectionId.value ? [collectionId.value] : undefined,
      // The API widens a category to its whole subtree (mpath), so picking
      // "Maison" also returns what sits under Cuisine, Lumière and Décoration.
      'category_id[]': categoryId.value ? [categoryId.value] : undefined,
    }),
  { watch: [regionId, () => route.query] },
)

const products = computed(() => data.value?.products ?? [])

// `ALL` rather than '': Reka's Select reserves the empty string for "no
// selection, show the placeholder" and throws on an item that uses it.
const ALL = 'all'
const collectionItems = computed(() => [
  { value: ALL, label: t('productAllCollections') },
  ...collections.value.map((c) => ({ value: c.id, label: c.title })),
])
const categoryItems = computed(() => [
  { value: ALL, label: t('productAllCategories') },
  ...categories.value.map((c) => ({ value: c.id, label: c.name })),
])
const pick = (v: unknown) => (String(v) === ALL ? undefined : String(v))
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <h1 class="shop-display text-3xl text-highlighted sm:text-4xl">{{ t('productShopTitle') }}</h1>
    <p class="mt-2 text-muted">{{ tf(one(products.length) ? 'productCountOne' : 'productCountOther', { count: products.length }) }}</p>

    <form class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" role="search" @submit.prevent>
      <UInput
        v-model="q"
        icon="i-lucide-search"
        :placeholder="t('productSearch')"
        class="sm:max-w-xs sm:flex-1"
        :aria-label="t('productSearch')"
      />
      <USelect
        :model-value="collectionId ?? ALL"
        :items="collectionItems"
        class="sm:w-52"
        :aria-label="t('productFilterCollection')"
        @update:model-value="setQuery({ collection: pick($event) })"
      />
      <USelect
        :model-value="categoryId ?? ALL"
        :items="categoryItems"
        class="sm:w-52"
        :aria-label="t('productFilterCategory')"
        @update:model-value="setQuery({ category: pick($event) })"
      />
      <UButton
        v-if="hasFilters"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :label="t('productClearFilters')"
        @click="clearFilters()"
      />
    </form>

    <ProductGrid
      class="mt-10"
      :products="products"
      :currency="currencyCode"
      :pending="pending"
      :error="error"
      :empty-title="t(hasFilters ? 'productNoMatchTitle' : 'productListEmptyTitle')"
      :empty-message="t(hasFilters ? 'productNoMatchMessage' : 'productListEmptyMessage')"
      @retry="refresh()"
    />
  </div>
</template>
