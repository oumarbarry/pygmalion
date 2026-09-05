<script setup lang="ts">
/** E2 — draft orders: a commerçant preparing an order by phone or in store. */
import { orderStatusView, type OrderRow } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { data, status, error, refresh } = useAdminFetch<{ draftOrders: OrderRow[] }>('/api/admin/draft-orders', { query: { limit: 50 } })

const drafts = computed(() => data.value?.draftOrders ?? [])
const loading = computed(() => status.value === 'pending')

const columns = computed(() => [
  { key: 'displayId', label: t('ordersColNumber') },
  { key: 'email', label: t('ordersColCustomer') },
  { key: 'createdAt', label: t('ordersColDate') },
  { key: 'total', label: t('ordersColAmount') },
  { key: 'status', label: t('labelStatus') },
])

const { formatDate } = useAdminFormat()
</script>

<template>
  <PygPage :title="t('draftsTitle')" :description="t('draftsSubtitle')" back-to="/admin/orders">
    <template #actions>
      <UButton to="/admin/orders/drafts/new" icon="i-lucide-plus" :label="t('draftNew')" />
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="t('errorGeneric')"
    >
      <template #actions>
        <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="refresh()" />
      </template>
    </UAlert>

    <PygList v-else :items="drafts" :columns="columns" :loading="loading" :to="(d) => `/admin/orders/drafts/${d.id}`">
      <template #cell-displayId="{ item }">
        <span class="font-bold text-highlighted">{{ t('orderNumberPrefix') }}{{ item.displayId }}</span>
      </template>
      <template #cell-email="{ item }">
        {{ item.email ?? t('orderGuest') }}
      </template>
      <template #cell-createdAt="{ item }">
        {{ formatDate(item.createdAt) }}
      </template>
      <template #cell-total="{ item }">
        <PygMoney :cents="item.total" :currency="item.currencyCode" size="md" />
      </template>
      <template #cell-status="{ item }">
        <PygStatus
          :tone="orderStatusView(item.status).tone"
          :icon="orderStatusView(item.status).icon"
          :label="t(orderStatusView(item.status).key)"
        />
      </template>
      <template #empty>
        <PygEmptyState
          icon="i-lucide-file-pen-line"
          :title="t('draftsEmptyTitle')"
          :description="t('draftsEmptyDescription')"
          :action-label="t('draftNew')"
          action-icon="i-lucide-plus"
          action-to="/admin/orders/drafts/new"
        />
      </template>
    </PygList>
  </PygPage>
</template>
