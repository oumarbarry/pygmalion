<script setup lang="ts">
const client = usePygmalion()
const route = useRoute()
const { regionId, currencyCode, categories } = useShop()

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `category:${id.value}`,
  async () => {
    const [{ category }, { products }] = await Promise.all([
      client.store.categories.get(id.value),
      // Returns the sub-categories' products too (mpath descendants).
      client.store.categories.products(id.value, { limit: 48, region_id: regionId.value }),
    ])
    return { category, products }
  },
  { watch: [regionId, id] },
)

const children = computed(() => categories.value.filter((c) => c.parentCategoryId === id.value))

useSeoMeta({
  title: () => data.value?.category.name ?? 'Rayon',
  description: () => data.value?.category.description ?? '',
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <NuxtLink to="/products" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-highlighted">
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      Toute la boutique
    </NuxtLink>

    <h1 class="shop-display mt-4 text-3xl text-highlighted sm:text-4xl">{{ data?.category.name ?? 'Rayon' }}</h1>
    <p v-if="data?.category.description" class="shop-prose mt-2 text-muted">{{ data.category.description }}</p>

    <nav v-if="children.length" class="mt-6 flex flex-wrap gap-2" aria-label="Sous-rayons">
      <UButton
        v-for="c in children"
        :key="c.id"
        :to="`/categories/${c.id}`"
        size="sm"
        color="neutral"
        variant="outline"
        :label="c.name"
      />
    </nav>

    <ProductGrid
      class="mt-10"
      :products="data?.products ?? []"
      :currency="currencyCode"
      :pending="pending"
      :error="error"
      empty-title="Ce rayon est vide"
      empty-message="Aucun produit n'y est encore classé."
      @retry="refresh()"
    />
  </div>
</template>
