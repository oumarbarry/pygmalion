<script setup lang="ts">
/**
 * Boutique. The three answers a merchant actually owes the store: its
 * name, which selling area is the main one (that's where the default currency
 * comes from) and which sales channel new products land on.
 *
 * The currency is deliberately NOT a field of its own: `stores` has no
 * currency column — the default currency IS the main selling area's currency.
 * Showing a second, editable "default currency" control would let a merchant
 * set two contradicting truths.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ stores: AdminStore[] }>('/api/admin/stores')
const store = computed(() => data.value?.stores?.[0] ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const { data: regionData } = useAdminFetch<{ regions: AdminRegionDetail[] }>('/api/admin/regions', {
  query: { limit: 100 },
})
const regions = computed(() => regionData.value?.regions ?? [])

const { data: channelData } = useAdminFetch<{ salesChannels: AdminSalesChannelDetail[] }>('/api/admin/sales-channels', {
  query: { limit: 100 },
})
const channels = computed(() => channelData.value?.salesChannels ?? [])

// SELECT_NONE, never '' — an empty SelectItem value crashes Reka UI.
const draft = reactive({ name: '', defaultRegionId: SELECT_NONE, defaultSalesChannelId: SELECT_NONE })

watchEffect(() => {
  if (!store.value) return
  draft.name = store.value.name
  draft.defaultRegionId = store.value.defaultRegionId ?? SELECT_NONE
  draft.defaultSalesChannelId = store.value.defaultSalesChannelId ?? SELECT_NONE
})

const regionItems = computed(() => [
  { label: t('labelNone'), value: SELECT_NONE },
  ...regions.value.map((r) => ({ label: `${r.name} — ${r.currencyCode.toUpperCase()}`, value: r.id })),
])
const channelItems = computed(() => [
  { label: t('labelNone'), value: SELECT_NONE },
  ...channels.value.map((c) => ({ label: c.name, value: c.id })),
])

/** The default currency, derived — see the file header. */
const defaultCurrency = computed(
  () => regions.value.find((r) => r.id === draft.defaultRegionId)?.currencyCode.toUpperCase() ?? null,
)
const currenciesInUse = computed(() => [...new Set(regions.value.map((r) => r.currencyCode.toUpperCase()))].sort())

const saving = ref(false)

async function save() {
  if (!store.value || !draft.name.trim()) return
  saving.value = true
  try {
    await fetcher(`/api/admin/stores/${store.value.id}`, {
      method: 'POST',
      body: {
        name: draft.name.trim(),
        defaultRegionId: selectValue(draft.defaultRegionId) || null,
        defaultSalesChannelId: selectValue(draft.defaultSalesChannelId) || null,
      },
    })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setStoreTitle')" :description="t('setStoreSubtitle')">
    <PygSubNav :items="navItems" />

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="error.statusMessage ?? t('errorGeneric')"
    >
      <template #actions>
        <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="refresh()" />
      </template>
    </UAlert>

    <div v-else-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton class="h-40 w-full rounded-2xl" />
      <USkeleton class="h-28 w-full rounded-2xl" />
    </div>

    <template v-else-if="store">
      <UCard>
        <PygForm :state="draft" :loading="saving" :show-cancel="false" @submit="save">
          <UFormField :label="t('setStoreNameLabel')" :description="t('setStoreNameHint')" name="name" required>
            <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" />
          </UFormField>

          <UFormField
            :label="t('setStoreDefaultRegion')"
            :description="t('setStoreDefaultRegionHint')"
            name="defaultRegionId"
          >
            <USelect
              v-model="draft.defaultRegionId"
              :items="regionItems"
              value-key="value"
              size="md"
              class="w-full sm:max-w-md"
            />
          </UFormField>

          <UFormField
            :label="t('setStoreDefaultChannel')"
            :description="t('setStoreDefaultChannelHint')"
            name="defaultSalesChannelId"
          >
            <USelect
              v-model="draft.defaultSalesChannelId"
              :items="channelItems"
              value-key="value"
              size="md"
              class="w-full sm:max-w-md"
            />
          </UFormField>
        </PygForm>
      </UCard>

      <UCard v-if="regions.length">
        <div class="flex flex-col gap-4">
          <div>
            <h2 class="text-lg font-bold text-highlighted">{{ t('setStoreCurrencyTitle') }}</h2>
            <p class="text-sm text-muted mt-1">{{ t('setStoreCurrencyHint') }}</p>
          </div>
          <p class="text-3xl sm:text-4xl font-bold text-highlighted tabular-nums">
            {{ defaultCurrency ?? '—' }}
          </p>
          <div>
            <p class="text-xs text-dimmed">{{ t('setStoreCurrenciesInUse') }}</p>
            <div class="flex flex-wrap gap-2 mt-1">
              <UBadge v-for="code in currenciesInUse" :key="code" color="neutral" variant="soft" :label="code" />
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-else>
        <PygEmptyState
          icon="i-lucide-globe"
          :title="t('setStoreNoRegionTitle')"
          :description="t('setStoreNoRegionDescription')"
          :action-label="t('setRegionNew')"
          action-icon="i-lucide-plus"
          action-to="/admin/reglages/zones-de-vente"
        />
      </UCard>
    </template>

    <UCard v-else>
      <PygEmptyState icon="i-lucide-store" :title="t('setNotFound')" :description="t('errorGeneric')" />
    </UCard>
  </PygPage>
</template>
