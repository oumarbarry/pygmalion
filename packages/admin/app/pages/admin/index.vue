<script setup lang="ts">
// "Aujourd'hui" dashboard: structure + pedagogical empty states
// only. The order tiles are not wired yet; see
// composables/useTodayOverview.ts for the wiring contract.
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { toShip, toRefund, loading, lowStock, productsWithoutPhoto, catalogLoading } = useTodayOverview()

const columns = computed(() => [
  { key: 'customerName', label: t('name') },
  { key: 'totalCents', label: '' },
])

const lowStockColumns = computed(() => [
  { key: 'reference', label: t('sku'), value: (item: TodayLowStockItem) => item.reference },
  { key: 'available', label: t('stockAvailable'), class: 'w-32' },
])

const noPhotoColumns = computed(() => [
  { key: 'title', label: t('productName'), value: (item: TodayProductGap) => item.title },
])
</script>

<template>
  <PygPage :title="t('todayTitle')" :description="t('todaySubtitle')">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-truck" class="size-5 text-primary" />
            {{ t('todayToShip') }}
          </h2>
        </template>

        <PygList :items="toShip" :columns="columns" :loading="loading">
          <template #cell-totalCents="{ item }">
            <PygMoney :cents="item.totalCents" :currency="item.currency" size="sm" />
          </template>
          <template #empty>
            <PygEmptyState
              icon="i-lucide-package-check"
              :title="t('todayToShipEmptyTitle')"
              :description="t('todayToShipEmptyDescription')"
            />
          </template>
        </PygList>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-rotate-ccw" class="size-5 text-warning" />
            {{ t('todayToRefund') }}
          </h2>
        </template>

        <PygList :items="toRefund" :columns="columns" :loading="loading">
          <template #cell-totalCents="{ item }">
            <PygMoney :cents="item.totalCents" :currency="item.currency" size="sm" />
          </template>
          <template #empty>
            <PygEmptyState
              icon="i-lucide-rotate-ccw"
              :title="t('todayToRefundEmptyTitle')"
              :description="t('todayToRefundEmptyDescription')"
            />
          </template>
        </PygList>
      </UCard>

      <!-- Catalogue tiles: what stops the merchant selling today. -->
      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-boxes" class="size-5 text-warning" />
            {{ t('todayLowStock') }}
          </h2>
        </template>

        <PygList :items="lowStock" :columns="lowStockColumns" :loading="catalogLoading">
          <template #cell-available="{ item }">
            <span class="text-xl font-bold text-highlighted tabular-nums">{{ item.available }}</span>
          </template>
          <template #empty>
            <PygEmptyState
              icon="i-lucide-package-check"
              :title="t('todayLowStockEmptyTitle')"
              :description="t('todayLowStockEmptyDescription')"
            />
          </template>
        </PygList>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-image-off" class="size-5 text-info" />
            {{ t('todayNoPhoto') }}
          </h2>
        </template>

        <PygList
          :items="productsWithoutPhoto"
          :columns="noPhotoColumns"
          :loading="catalogLoading"
          :to="(item) => `/admin/produits/${item.id}`"
        >
          <template #empty>
            <PygEmptyState
              icon="i-lucide-image"
              :title="t('todayNoPhotoEmptyTitle')"
              :description="t('todayNoPhotoEmptyDescription')"
            />
          </template>
        </PygList>
      </UCard>
    </div>
  </PygPage>
</template>
