<script setup lang="ts">
// The storefront talks to the API through `@oumarbarry/pygmalion-sdk` (usePygmalion)
// and the composables built on it — never a hand-written `$fetch('/api/store/…')`.
// During SSR the client runs on `event.fetch`, so this stays an in-process call
// and carries the request's cookies.
const client = usePygmalion()
const { regionId, currencyCode, collections } = useShop()

useSeoMeta({
  title: 'Objets pour la maison',
  description: 'Céramique, lumière, textile et papeterie choisis pour durer. Expédié depuis Nantes sous 48 h.',
})

// The whole page is one listing call: the newest twelve, priced in the visitor's
// region. Keyed on the region so switching currency refetches.
const { data, pending, error, refresh } = await useAsyncData(
  'home:new',
  () => client.store.products.list({ limit: 12, region_id: regionId.value }),
  { watch: [regionId] },
)

const newest = computed(() => data.value?.products ?? [])
const hero = computed(() => newest.value.find((p) => p.thumbnail) ?? null)
</script>

<template>
  <div>
    <!-- Hero: one real product, large, next to what the shop promises. -->
    <section class="border-b border-default">
      <div class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 class="shop-display text-4xl text-highlighted sm:text-5xl lg:text-6xl">Des objets qu'on garde.</h1>
          <p class="shop-prose mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Céramique tournée, laine tissée, bois massif. Une petite sélection pour la maison, choisie pour vieillir
            correctement — et expédiée de Nantes sous 48 heures.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <UButton to="/products" size="lg" color="primary" label="Voir la boutique" />
            <UButton
              v-if="collections[0]"
              :to="`/collections/${collections[0].id}`"
              size="lg"
              color="neutral"
              variant="outline"
              :label="collections[0].title"
            />
          </div>
          <p class="mt-6 text-sm text-dimmed">Livraison offerte dès 80&nbsp;€ · Retours acceptés 30 jours</p>
        </div>

        <NuxtLink v-if="hero" :to="`/products/${hero.id}`" class="group block">
          <div class="shop-media aspect-4/5 overflow-hidden rounded-2xl lg:aspect-square">
            <img
              :src="hero.thumbnail!"
              :alt="hero.title"
              width="620"
              height="620"
              class="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            >
          </div>
          <p class="mt-3 text-sm text-muted">
            Dernière arrivée — <span class="font-semibold text-highlighted">{{ hero.title }}</span>
          </p>
        </NuxtLink>
      </div>
    </section>

    <!-- Collections: two doors, not a grid of identical icon cards. -->
    <section v-if="collections.length" class="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h2 class="shop-display text-2xl text-highlighted sm:text-3xl">Nos collections</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <NuxtLink
          v-for="c in collections"
          :key="c.id"
          :to="`/collections/${c.id}`"
          class="group flex items-center justify-between rounded-xl border border-default px-6 py-8 transition-colors hover:border-accented hover:bg-muted/40"
        >
          <span>
            <span class="block text-lg font-bold text-highlighted">{{ c.title }}</span>
            <span class="mt-1 block text-sm text-muted">Découvrir la sélection</span>
          </span>
          <UIcon
            name="i-lucide-arrow-right"
            class="size-5 shrink-0 text-muted transition-transform duration-300 ease-out group-hover:translate-x-1 group-hover:text-highlighted"
          />
        </NuxtLink>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="shop-display text-2xl text-highlighted sm:text-3xl">Nouveautés</h2>
        <NuxtLink
          to="/products"
          class="shrink-0 text-sm font-medium text-muted underline-offset-4 hover:text-highlighted hover:underline"
        >
          Tout voir
        </NuxtLink>
      </div>

      <AsyncState
        class="mt-6"
        :pending="pending"
        :error="error"
        :empty="!newest.length"
        :skeleton="8"
        empty-title="La boutique est encore vide"
        empty-message="Ajoutez des produits depuis l'administration, ils apparaîtront ici."
        @retry="refresh()"
      >
        <div class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          <ProductCard v-for="p in newest" :key="p.id" :product="p" :currency="currencyCode" />
        </div>
      </AsyncState>
    </section>
  </div>
</template>
