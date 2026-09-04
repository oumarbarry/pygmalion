<script setup lang="ts">
import type { StoreProductListItem } from '@oumarbarry/pygmalion-sdk'

const props = defineProps<{ product: StoreProductListItem; currency?: string }>()

// The API sends cents; the card only picks the smallest one and formats it.
const from = computed(() => priceFrom(props.product.variants))
const multiPriced = computed(() => {
  const amounts = new Set((props.product.variants ?? []).map((v) => v.calculatedPrice?.calculatedAmount))
  return amounts.size > 1
})
</script>

<template>
  <NuxtLink :to="`/products/${product.id}`" class="group block" :data-product="product.id">
    <div class="shop-media aspect-4/5 overflow-hidden rounded-xl">
      <img
        v-if="product.thumbnail"
        :src="product.thumbnail"
        :alt="product.title"
        loading="lazy"
        width="620"
        height="775"
        class="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
      >
      <div v-else class="flex size-full items-center justify-center">
        <UIcon name="i-lucide-image" class="size-8 text-dimmed" />
      </div>
    </div>

    <h3 class="mt-3 font-semibold text-highlighted group-hover:underline underline-offset-4">{{ product.title }}</h3>
    <p v-if="product.subtitle" class="mt-0.5 line-clamp-1 text-sm text-muted">{{ product.subtitle }}</p>
    <p v-if="from !== null" class="shop-price mt-1.5 text-sm text-highlighted" :data-amount="from">
      <span v-if="multiPriced" class="font-normal text-muted">à partir de </span>{{ formatMoney(from, currency) }}
    </p>
    <!-- No price in this region is a real case (a product priced only in USD,
         say). Say it — a card whose price line is simply absent reads broken. -->
    <p v-else class="mt-1.5 text-sm text-muted">Prix indisponible ici</p>
  </NuxtLink>
</template>
