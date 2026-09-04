<script setup lang="ts">
/**
 * The orders list, organised by ACTION and not by technical status
 *: « À expédier », « À encaisser », « Retours en cours », « Toutes ».
 *
 * `GET /api/admin/orders` returns raw rows (no derived
 * payment/fulfillment status, no `q`, no status filter), so the page loads a
 * page of orders and enriches each one with its detail (which does derive
 * both statuses). N ≤ `PAGE` per load, in parallel, cached. Upgrade path:
 * filters + derived statuses on the list endpoint, then delete `enrich()`.
 */
import {
  fulfillmentStatusView,
  matchesSearch,
  matchesTab,
  paymentStatusView,
  type OrderDetail,
  type OrderReturn,
  type OrderRow,
  type OrderTab,
} from '../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()

const PAGE = 20

const rows = ref<OrderRow[]>([])
const details = ref(new Map<string, OrderDetail>())
const openReturns = ref(new Map<string, boolean>())
const loading = ref(true)
const failed = ref(false)
const hasMore = ref(false)
const tab = ref<OrderTab>('toShip')
const query = ref('')

async function enrich(batch: OrderRow[]) {
  const loaded = await Promise.all(
    batch.map((r) => fetcher<{ order: OrderDetail }>(`/api/admin/orders/${r.id}`).then((res) => res.order)),
  )
  const next = new Map(details.value)
  for (const o of loaded) next.set(o.id, o)
  details.value = next
}

/** Only the returns tab needs this — one extra call per order, cached. */
async function loadReturns() {
  const missing = rows.value.filter((r) => !openReturns.value.has(r.id))
  if (!missing.length) return
  const results = await Promise.all(
    missing.map((r) =>
      fetcher<{ returns: OrderReturn[] }>('/api/admin/returns', { query: { orderId: r.id } })
        .then((res) => [r.id, res.returns.some((x) => x.status === 'requested' || x.status === 'partially_received')] as const),
    ),
  )
  const next = new Map(openReturns.value)
  for (const [id, open] of results) next.set(id, open)
  openReturns.value = next
}

async function load(more = false) {
  loading.value = true
  failed.value = false
  try {
    const offset = more ? rows.value.length : 0
    const { orders } = await fetcher<{ orders: OrderRow[] }>('/api/admin/orders', { query: { limit: PAGE, offset } })
    rows.value = more ? [...rows.value, ...orders] : orders
    hasMore.value = orders.length === PAGE
    await enrich(orders)
    if (tab.value === 'returns') await loadReturns()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

watch(tab, async (value) => {
  if (value !== 'returns' || loading.value) return
  loading.value = true
  try {
    await loadReturns()
  } finally {
    loading.value = false
  }
})

const enriched = computed(() => rows.value.map((r) => details.value.get(r.id)).filter((o): o is OrderDetail => !!o))

const counts = computed(() => ({
  toShip: enriched.value.filter((o) => matchesTab(o, 'toShip', false)).length,
  toCollect: enriched.value.filter((o) => matchesTab(o, 'toCollect', false)).length,
}))

const visible = computed(() =>
  enriched.value.filter((o) => matchesTab(o, tab.value, openReturns.value.get(o.id) ?? false) && matchesSearch(o, query.value)),
)

const tabs = computed(() => [
  { key: 'toShip' as const, label: t('ordersTabToShip'), icon: 'i-lucide-truck', count: counts.value.toShip },
  { key: 'toCollect' as const, label: t('ordersTabToCollect'), icon: 'i-lucide-hand-coins', count: counts.value.toCollect },
  { key: 'returns' as const, label: t('ordersTabReturns'), icon: 'i-lucide-rotate-ccw', count: 0 },
  { key: 'all' as const, label: t('ordersTabAll'), icon: 'i-lucide-list', count: 0 },
])

const columns = computed(() => [
  { key: 'displayId', label: t('ordersColNumber') },
  { key: 'email', label: t('ordersColCustomer') },
  { key: 'createdAt', label: t('ordersColDate') },
  { key: 'total', label: t('ordersColAmount') },
  { key: 'paymentStatus', label: t('ordersColPayment') },
  { key: 'fulfillmentStatus', label: t('ordersColShipping') },
])

const emptyCopy = computed(() => {
  if (query.value.trim()) return { icon: 'i-lucide-search-x', title: t('ordersEmptySearchTitle'), description: t('ordersEmptySearchDescription') }
  if (tab.value === 'toShip') return { icon: 'i-lucide-package-check', title: t('ordersEmptyToShipTitle'), description: t('ordersEmptyToShipDescription') }
  if (tab.value === 'toCollect') return { icon: 'i-lucide-hand-coins', title: t('ordersEmptyToCollectTitle'), description: t('ordersEmptyToCollectDescription') }
  if (tab.value === 'returns') return { icon: 'i-lucide-rotate-ccw', title: t('ordersEmptyReturnsTitle'), description: t('ordersEmptyReturnsDescription') }
  return { icon: 'i-lucide-package', title: t('ordersEmptyAllTitle'), description: t('ordersEmptyAllDescription') }
})

const { formatDate } = useAdminFormat()
</script>

<template>
  <PygPage :title="t('sectionOrders')" :description="t('ordersSubtitle')">
    <template #actions>
      <UButton to="/admin/commandes/brouillons" color="neutral" variant="outline" icon="i-lucide-file-pen-line" :label="t('ordersDraftsLink')" />
    </template>

    <div class="flex flex-col gap-4">
      <UInput
        v-model="query"
        size="lg"
        icon="i-lucide-search"
        :placeholder="t('ordersSearchPlaceholder')"
        :aria-label="t('search')"
      />

      <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" :aria-label="t('sectionOrders')">
        <UButton
          v-for="item in tabs"
          :key="item.key"
          role="tab"
          :aria-selected="tab === item.key"
          :color="tab === item.key ? 'primary' : 'neutral'"
          :variant="tab === item.key ? 'soft' : 'ghost'"
          :icon="item.icon"
          class="shrink-0"
          @click="tab = item.key"
        >
          {{ item.label }}
          <UBadge v-if="item.count" color="neutral" size="sm" :label="String(item.count)" />
        </UButton>
      </div>

      <UAlert
        v-if="failed"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="t('errorTitle')"
        :description="t('errorGeneric')"
      >
        <template #actions>
          <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="load()" />
        </template>
      </UAlert>

      <PygList v-else :items="visible" :columns="columns" :loading="loading && !rows.length" :to="(o) => `/admin/commandes/${o.id}`">
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
        <template #cell-paymentStatus="{ item }">
          <PygStatus
            :tone="paymentStatusView(item.paymentStatus).tone"
            :icon="paymentStatusView(item.paymentStatus).icon"
            :label="t(paymentStatusView(item.paymentStatus).key)"
          />
        </template>
        <template #cell-fulfillmentStatus="{ item }">
          <PygStatus
            :tone="fulfillmentStatusView(item.fulfillmentStatus).tone"
            :icon="fulfillmentStatusView(item.fulfillmentStatus).icon"
            :label="t(fulfillmentStatusView(item.fulfillmentStatus).key)"
          />
        </template>
        <template #empty>
          <PygEmptyState
            :icon="emptyCopy.icon"
            :title="emptyCopy.title"
            :description="emptyCopy.description"
            :action-label="tab === 'all' && !query.trim() ? t('draftNew') : undefined"
            action-to="/admin/commandes/brouillons/nouveau"
          />
        </template>
      </PygList>

      <div v-if="hasMore && !failed" class="flex justify-center">
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-chevron-down"
          :label="t('ordersLoadMore')"
          :loading="loading"
          @click="load(true)"
        />
      </div>
    </div>
  </PygPage>
</template>
