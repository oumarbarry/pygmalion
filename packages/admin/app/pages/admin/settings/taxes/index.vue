<script setup lang="ts">
/**
 * Taxes, level 1: the countries where you must charge something. The
 * technical name (« tax region ») never surfaces: a merchant adds a country,
 * then opens it to set its rates.
 *
 * Province-level regions are children of a country region (the service
 * enforces the pairing), so both live in this one list, the province rows
 * shown under their country.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { tag } = useAdminFormat()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ taxRegions: AdminTaxRegion[] }>(
  '/api/admin/tax-regions',
  { query: { limit: 100 } },
)
const taxRegions = computed(() => data.value?.taxRegions ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const { data: rateData, refresh: refreshRates } = useAdminFetch<{ taxRates: AdminTaxRate[] }>('/api/admin/tax-rates', {
  query: { limit: 100 },
})
const rateCount = computed(() => {
  const counts = new Map<string, number>()
  for (const rate of rateData.value?.taxRates ?? []) {
    counts.set(rate.taxRegionId, (counts.get(rate.taxRegionId) ?? 0) + 1)
  }
  return counts
})

/** Countries first, each immediately followed by its provinces. */
const ordered = computed(() => {
  const parents = taxRegions.value.filter((r) => !r.parentId)
  const children = taxRegions.value.filter((r) => r.parentId)
  return parents.flatMap((p) => [p, ...children.filter((c) => c.parentId === p.id)])
})

function label(region: AdminTaxRegion): string {
  const country = countryName(region.countryCode, tag.value)
  return region.provinceCode ? `${country} — ${region.provinceCode.toUpperCase()}` : country
}

const columns = computed(() => [
  { key: 'country', label: t('setTaxColCountry') },
  { key: 'rates', label: t('setTaxColRates') },
])

// --- create ------------------------------------------------------------------
const countryItems = computed(() => countryList(tag.value).map((c) => ({ label: c.name, value: c.iso2 })))

const creating = ref(false)
const saving = ref(false)
const draft = reactive({ countryCode: '', provinceCode: '' })

async function create() {
  if (!draft.countryCode) return
  saving.value = true
  try {
    const parent = taxRegions.value.find((r) => !r.parentId && r.countryCode.toLowerCase() === draft.countryCode.toLowerCase())
    await fetcher('/api/admin/tax-regions', {
      method: 'POST',
      body: {
        countryCode: draft.countryCode,
        // A province row must hang off its country row (service invariant).
        ...(draft.provinceCode.trim() ? { provinceCode: draft.provinceCode.trim(), parentId: parent?.id } : {}),
      },
    })
    creating.value = false
    draft.countryCode = ''
    draft.provinceCode = ''
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- delete ------------------------------------------------------------------
const toDelete = ref<AdminTaxRegion | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/tax-regions/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await Promise.all([refresh(), refreshRates()])
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setTaxesTitle')" :description="t('setTaxesSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setTaxRegionNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; draft.countryCode = ''; draft.provinceCode = ''"
      >
        <UFormField :label="t('setTaxRegionCountry')" name="countryCode" required>
          <USelect
            v-model="draft.countryCode"
            :items="countryItems"
            value-key="value"
            size="md"
            class="w-full sm:max-w-md"
          />
        </UFormField>

        <UFormField
          :label="t('setTaxRegionProvince')"
          :description="t('setTaxRegionProvinceHint')"
          name="provinceCode"
        >
          <UInput v-model="draft.provinceCode" size="md" class="w-full sm:max-w-xs" />
        </UFormField>
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

    <PygList
      v-else
      :items="ordered"
      :columns="columns"
      :loading="loading"
      :to="(r) => `/admin/settings/taxes/${r.id}`"
    >
      <template #cell-country="{ item }">
        <span class="font-semibold text-highlighted" :class="item.parentId ? 'sm:pl-6' : ''">{{ label(item) }}</span>
      </template>

      <template #cell-rates="{ item }">
        <span class="tabular-nums">{{ rateCount.get(item.id) ?? 0 }}</span>
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
          icon="i-lucide-percent"
          :title="t('setTaxRegionsEmptyTitle')"
          :description="t('setTaxRegionsEmptyDescription')"
          :action-label="t('setTaxRegionNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('setDeleteTaxRegionTitle')"
      :description="t('setDeleteTaxRegionBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
