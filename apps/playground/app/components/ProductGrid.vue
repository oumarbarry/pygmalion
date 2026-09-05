<script setup lang="ts">
import type { StoreProductListItem } from '@oumarbarry/pygmalion-sdk'

defineProps<{
  products: StoreProductListItem[]
  currency?: string
  pending?: boolean
  error?: unknown
  emptyTitle?: string
  emptyMessage?: string
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useShopText()
</script>

<template>
  <AsyncState
    :pending="pending"
    :error="error"
    :empty="!products.length"
    :skeleton="6"
    :empty-title="emptyTitle ?? t('productGridEmptyTitle')"
    :empty-message="emptyMessage ?? t('productGridEmptyMessage')"
    empty-icon="i-lucide-search-x"
    @retry="emit('retry')"
  >
    <div class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard v-for="p in products" :key="p.id" :product="p" :currency="currency" />
    </div>
  </AsyncState>
</template>
