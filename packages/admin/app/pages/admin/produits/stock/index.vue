<script setup lang="ts">
/**
 * Stock: what is left, per référence and per storage place, plus what is
 * already promised to customers.
 *
 * « Corriger le stock » asks what happened first (received / lost / counted)
 * and does the arithmetic for the merchant — the API only takes an absolute
 * `stockedQuantity`, and asking a non-technical user for an absolute number
 * after a delivery is how counts drift. The reason itself is not stored: no
 * endpoint records a stock movement, so the screen never pretends there is
 * an audit trail.
 *
 * Levels are fetched per item (no bulk endpoint), capped at the first page of
 * items. N+1 over <=50 rows; upgrade path = a levels-included list
 * endpoint if a merchant ever has thousands of références.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const navItems = useCatalogNav()
const route = useRoute()

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const debouncedSearch = ref(search.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { debouncedSearch.value = value.trim() }, 250)
})

const { data: itemData, status: fetchStatus, error, refresh: refreshItems } = useAdminFetch<{ inventoryItems: AdminInventoryItem[] }>(
  '/api/admin/inventory-items',
  { query: computed(() => ({ limit: 50, ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}) })) },
)
const items = computed(() => itemData.value?.inventoryItems ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const { data: locationData } = useAdminFetch<{ stockLocations: AdminStockLocation[] }>('/api/admin/stock-locations', {
  query: { limit: 100 },
})
const locations = computed(() => locationData.value?.stockLocations ?? [])
const locationName = (id: string) => locations.value.find((l) => l.id === id)?.name ?? id

const { data: reservationData } = useAdminFetch<{ reservations: AdminReservation[] }>('/api/admin/reservations', {
  query: { limit: 50 },
})
const reservations = computed(() => reservationData.value?.reservations ?? [])

const levelsByItem = ref<Record<string, AdminLocationLevel[]>>({})

async function loadLevels() {
  const result: Record<string, AdminLocationLevel[]> = {}
  await Promise.all(items.value.map(async (item) => {
    const { locationLevels } = await $adminFetch<{ locationLevels: AdminLocationLevel[] }>(
      `/api/admin/inventory-items/${item.id}/location-levels`,
    )
    result[item.id] = locationLevels
  }))
  levelsByItem.value = result
}
watch(items, loadLevels, { immediate: true })

interface StockRow {
  id: string
  item: AdminInventoryItem
  level: AdminLocationLevel | null
  locationId: string | null
}

const rows = computed<StockRow[]>(() =>
  items.value.flatMap((item): StockRow[] => {
    const levels = levelsByItem.value[item.id] ?? []
    if (!levels.length) return [{ id: item.id, item, level: null, locationId: null }]
    return levels.map((level) => ({ id: level.id, item, level, locationId: level.locationId }))
  }),
)

function toneFor(level: AdminLocationLevel | null) {
  if (!level) return { label: t('stockNoLevelTitle'), tone: 'neutral' as const, icon: 'i-lucide-circle-dashed' }
  if (level.available <= 0) return { label: t('stockOutBadge'), tone: 'error' as const, icon: 'i-lucide-circle-x' }
  if (level.available <= LOW_STOCK_THRESHOLD) {
    return { label: t('stockLowBadge'), tone: 'warning' as const, icon: 'i-lucide-triangle-alert' }
  }
  return { label: t('stockOkBadge'), tone: 'success' as const, icon: 'i-lucide-circle-check' }
}

const columns = computed(() => [
  { key: 'item', label: t('stockItem') },
  { key: 'location', label: t('reservationLocation') },
  { key: 'available', label: t('stockAvailable'), class: 'w-32' },
  { key: 'state', label: t('productStatus'), class: 'w-40' },
])

// --- adjust ------------------------------------------------------------------
const adjusting = ref<StockRow | null>(null)
const adjust = reactive({ reason: 'received' as 'received' | 'lost' | 'correction', amount: '', locationId: '' })
const savingAdjust = ref(false)

function startAdjust(row: StockRow) {
  adjusting.value = row
  adjust.reason = 'received'
  adjust.amount = ''
  adjust.locationId = row.locationId ?? locations.value[0]?.id ?? ''
}

const newTotal = computed(() => {
  const current = adjusting.value?.level?.stocked ?? 0
  const amount = Number.parseInt(adjust.amount, 10)
  if (!Number.isFinite(amount)) return current
  if (adjust.reason === 'received') return current + amount
  if (adjust.reason === 'lost') return Math.max(0, current - amount)
  return Math.max(0, amount)
})

async function applyAdjust() {
  const row = adjusting.value
  if (!row || !adjust.locationId) return
  savingAdjust.value = true
  try {
    await $adminFetch(`/api/admin/inventory-items/${row.item.id}/location-levels/${adjust.locationId}`, {
      method: 'POST',
      body: { stockedQuantity: newTotal.value },
    })
    adjusting.value = null
    await refreshItems()
    await loadLevels()
  } finally {
    savingAdjust.value = false
  }
}

const reasonChoices = computed(() => [
  { value: 'received' as const, label: t('stockReasonReceived'), icon: 'i-lucide-package-plus' },
  { value: 'lost' as const, label: t('stockReasonLost'), icon: 'i-lucide-package-minus' },
  { value: 'correction' as const, label: t('stockReasonCorrection'), icon: 'i-lucide-clipboard-check' },
])

const referenceForItem = (id: string) => items.value.find((i) => i.id === id)?.sku ?? id
</script>

<template>
  <PygPage :title="t('stockTitle')" :description="t('stockSubtitle')">
    <PygSubNav :items="navItems" />

    <UFormField :label="t('search')" name="q" class="sm:w-96">
      <UInput v-model="search" icon="i-lucide-search" size="md" class="w-full" :placeholder="t('sku')" />
    </UFormField>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="error.statusMessage ?? t('errorGeneric')"
    >
      <template #actions>
        <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="refreshItems()" />
      </template>
    </UAlert>

    <PygList v-else :items="rows" :columns="columns" :loading="loading">
      <template #cell-item="{ item: row }">
        <span class="font-semibold text-highlighted">{{ row.item.sku ?? row.item.id }}</span>
      </template>

      <template #cell-location="{ item: row }">
        <span class="text-muted">{{ row.locationId ? locationName(row.locationId) : '—' }}</span>
      </template>

      <template #cell-available="{ item: row }">
        <span class="text-xl font-bold text-highlighted">{{ row.level?.available ?? '—' }}</span>
        <span v-if="row.level" class="block text-xs text-muted">
          {{ t('stockOnHand') }} {{ row.level.stocked }} · {{ t('stockReserved') }} {{ row.level.reserved }}
        </span>
      </template>

      <template #cell-state="{ item: row }">
        <PygStatus :label="toneFor(row.level).label" :tone="toneFor(row.level).tone" :icon="toneFor(row.level).icon" />
      </template>

      <template #actions="{ item: row }">
        <UButton
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="t('stockAdjust')"
          @click="startAdjust(row)"
        />
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-boxes"
          :title="t('stockEmptyTitle')"
          :description="t('stockEmptyDescription')"
          :action-label="t('newProduct')"
          action-icon="i-lucide-plus"
          action-to="/admin/produits/nouveau"
        />
      </template>
    </PygList>

    <!-- Inline correction panel: a modal would hide the number being corrected. -->
    <UCard v-if="adjusting">
      <template #header>
        <h2 class="font-bold text-highlighted">
          {{ t('stockAdjustTitle') }} · {{ adjusting.item.sku ?? adjusting.item.id }}
        </h2>
      </template>

      <div class="flex flex-col gap-5">
        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-semibold text-highlighted mb-2">{{ t('stockReasonQuestion') }}</legend>
          <label
            v-for="choice in reasonChoices"
            :key="choice.value"
            class="pyg-tap-target flex items-center gap-3 rounded-xl border px-4 cursor-pointer transition-colors"
            :class="adjust.reason === choice.value ? 'border-primary bg-primary/5 text-primary' : 'border-default hover:bg-muted'"
          >
            <input v-model="adjust.reason" type="radio" :value="choice.value" class="size-4 accent-current">
            <UIcon :name="choice.icon" class="size-5 shrink-0" />
            <span class="text-sm font-semibold">{{ choice.label }}</span>
          </label>
        </fieldset>

        <div class="flex flex-col sm:flex-row sm:items-end gap-3">
          <UFormField :label="t('quantity')" name="amount" class="sm:w-48" required>
            <UInput v-model="adjust.amount" size="md" class="w-full" inputmode="numeric" placeholder="0" />
          </UFormField>
          <UFormField v-if="locations.length > 1" :label="t('stockLocationLabel')" name="location" class="sm:w-64">
            <USelect
              v-model="adjust.locationId"
              :items="locations.map((l) => ({ label: l.name, value: l.id }))"
              value-key="value"
              size="md"
              class="w-full"
            />
          </UFormField>
          <div class="sm:ms-auto">
            <p class="text-xs text-dimmed">{{ t('stockNewTotal') }}</p>
            <p class="text-3xl font-bold text-highlighted tabular-nums">{{ newTotal }}</p>
          </div>
        </div>

        <PygEmptyState
          v-if="!locations.length"
          icon="i-lucide-warehouse"
          :title="t('noStockLocationTitle')"
          :description="t('noStockLocationDescription')"
        />

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <UButton
            color="neutral"
            variant="outline"
            size="md"
            block
            class="sm:w-auto"
            :label="t('cancel')"
            @click="adjusting = null"
          />
          <UButton
            size="md"
            block
            class="sm:w-auto"
            :label="t('apply')"
            :loading="savingAdjust"
            :disabled="!adjust.locationId || !adjust.amount"
            @click="applyAdjust"
          />
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h2 class="font-bold text-highlighted">{{ t('reservations') }}</h2>
          <p class="text-sm text-muted">{{ t('reservationsSubtitle') }}</p>
        </div>
      </template>

      <PygList
        :items="reservations"
        :columns="[
          { key: 'item', label: t('stockItem') },
          { key: 'lineItemId', label: t('reservationOrderRef') },
          { key: 'location', label: t('reservationLocation') },
          { key: 'quantity', label: t('quantity'), class: 'w-24' },
        ]"
      >
        <template #cell-item="{ item }">
          <span class="font-semibold text-highlighted">{{ referenceForItem(item.inventoryItemId) }}</span>
        </template>
        <template #cell-lineItemId="{ item }">
          <span class="text-muted">{{ item.description ?? item.lineItemId ?? '—' }}</span>
        </template>
        <template #cell-location="{ item }">
          <span class="text-muted">{{ locationName(item.locationId) }}</span>
        </template>
        <template #cell-quantity="{ item }">
          <span class="text-base font-bold text-highlighted tabular-nums">{{ item.quantity }}</span>
        </template>
        <template #empty>
          <PygEmptyState
            icon="i-lucide-hand-coins"
            :title="t('reservationsEmptyTitle')"
            :description="t('reservationsEmptyDescription')"
          />
        </template>
      </PygList>
    </UCard>
  </PygPage>
</template>
