<script setup lang="ts">
import type { StoreProductListItem } from '@oumarbarry/pygmalion-sdk'

withDefaults(
  defineProps<{
    products: StoreProductListItem[]
    currency?: string
    pending?: boolean
    error?: unknown
    emptyTitle?: string
    emptyMessage?: string
  }>(),
  {
    emptyTitle: 'Aucun produit ici',
    emptyMessage: 'Essayez un autre rayon, ou retirez les filtres.',
  },
)
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <AsyncState
    :pending="pending"
    :error="error"
    :empty="!products.length"
    :skeleton="6"
    :empty-title="emptyTitle"
    :empty-message="emptyMessage"
    empty-icon="i-lucide-search-x"
    @retry="emit('retry')"
  >
    <div class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard v-for="p in products" :key="p.id" :product="p" :currency="currency" />
    </div>
  </AsyncState>
</template>
