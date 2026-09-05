<script setup lang="ts">
/**
 * Prix & taxes: the one pricing setting a merchant genuinely has to
 * answer (« mes prix affichés contiennent-ils la taxe ? ») per selling area
 * or per currency (`/api/admin/price-preferences`).
 *
 * The technical shape (attribute + value) is never shown as such: the merchant
 * picks « une zone de vente » or « une monnaie », then which one.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const navItems = useCatalogNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ pricePreferences: AdminPricePreference[] }>(
  '/api/admin/price-preferences',
  { query: { limit: 100 } },
)
const preferences = computed(() => data.value?.pricePreferences ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const { data: regionData } = useAdminFetch<{ regions: AdminRegion[] }>('/api/admin/regions', { query: { limit: 100 } })
const regions = computed(() => regionData.value?.regions ?? [])
const currencies = computed(() => [...new Set(regions.value.map((r) => r.currencyCode))])

function describe(preference: AdminPricePreference): string {
  if (preference.attribute === 'region_id') {
    return regions.value.find((r) => r.id === preference.value)?.name ?? preference.value ?? '—'
  }
  return preference.value?.toUpperCase() ?? '—'
}

const columns = computed(() => [
  { key: 'scope', label: t('appliesTo') },
  { key: 'taxInclusive', label: t('pricingTitle') },
])

// --- create ------------------------------------------------------------------
const creating = ref(false)
const draft = reactive({ attribute: 'region_id' as 'region_id' | 'currency_code', value: '', isTaxInclusive: true })
const saving = ref(false)

const attributeItems = computed(() => [
  { label: t('appliesToRegion'), value: 'region_id' },
  { label: t('appliesToCurrency'), value: 'currency_code' },
])
const valueItems = computed(() =>
  draft.attribute === 'region_id'
    ? regions.value.map((r) => ({ label: r.name, value: r.id }))
    : currencies.value.map((c) => ({ label: c.toUpperCase(), value: c })),
)
watch(() => draft.attribute, () => { draft.value = '' })

async function create() {
  if (!draft.value) return
  saving.value = true
  try {
    await $adminFetch('/api/admin/price-preferences', {
      method: 'POST',
      body: { attribute: draft.attribute, value: draft.value, isTaxInclusive: draft.isTaxInclusive },
    })
    creating.value = false
    draft.value = ''
    await refresh()
  } finally {
    saving.value = false
  }
}

async function toggleTaxInclusive(preference: AdminPricePreference, next: boolean) {
  await $adminFetch(`/api/admin/price-preferences/${preference.id}`, {
    method: 'POST',
    body: { isTaxInclusive: next },
  })
  await refresh()
}

const toDelete = ref<AdminPricePreference | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await $adminFetch(`/api/admin/price-preferences/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('pricingTitle')" :description="t('pricingSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('newPricePreference')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UAlert color="info" variant="soft" icon="i-lucide-info" :description="t('taxIncludedHint')" />

    <UCard v-if="creating">
      <PygForm :state="draft" :loading="saving" :submit-label="t('create')" @submit="create" @cancel="creating = false">
        <UFormField :label="t('appliesTo')" name="attribute" class="sm:w-72">
          <USelect v-model="draft.attribute" :items="attributeItems" value-key="value" size="md" class="w-full" />
        </UFormField>
        <UFormField :label="draft.attribute === 'region_id' ? t('appliesToRegion') : t('appliesToCurrency')" name="value" class="sm:w-72" required>
          <USelect v-model="draft.value" :items="valueItems" value-key="value" size="md" class="w-full" />
        </UFormField>
        <USwitch v-model="draft.isTaxInclusive" :label="t('taxIncluded')" :description="t('taxExcluded')" />
      </PygForm>
    </UCard>

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

    <PygList v-else :items="preferences" :columns="columns" :loading="loading">
      <template #cell-scope="{ item }">
        <span class="font-semibold text-highlighted">{{ describe(item) }}</span>
        <span class="block text-xs text-muted">
          {{ item.attribute === 'region_id' ? t('appliesToRegion') : t('appliesToCurrency') }}
        </span>
      </template>

      <template #cell-taxInclusive="{ item }">
        <USwitch
          :model-value="item.isTaxInclusive"
          :label="item.isTaxInclusive ? t('taxIncluded') : t('taxExcluded')"
          @update:model-value="(next) => toggleTaxInclusive(item, next)"
        />
      </template>

      <template #actions="{ item }">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          square
          size="md"
          :aria-label="t('delete')"
          @click="toDelete = item"
        />
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-receipt"
          :title="t('pricingEmptyTitle')"
          :description="t('pricingEmptyDescription')"
          :action-label="t('newPricePreference')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('deletePricePreferenceTitle')"
      :description="t('deletePricePreferenceBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
