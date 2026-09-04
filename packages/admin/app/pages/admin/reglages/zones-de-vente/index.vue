<script setup lang="ts">
/**
 * Zones de vente (`regions`). A selling area is what carries the
 * currency and the countries a customer can order from, so it is the first
 * thing a store needs after its name.
 *
 * Flat CRUD -> inline create form (same call as collections: wizards are
 * for *composed* operations, not a four-field form).
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ regions: AdminRegionDetail[] }>(
  '/api/admin/regions',
  { query: { limit: 100 } },
)
const regions = computed(() => data.value?.regions ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const { data: currencyData } = useAdminFetch<{ currencies: AdminCurrency[] }>('/api/admin/currencies', {
  query: { limit: 100 },
})
const currencyItems = computed(() =>
  (currencyData.value?.currencies ?? []).map((c) => ({
    label: `${c.code.toUpperCase()} — ${c.name}`,
    value: c.code,
  })),
)

const columns = computed(() => [
  { key: 'name', label: t('setRegionName'), value: (r: AdminRegionDetail) => r.name },
  { key: 'currency', label: t('setRegionCurrency'), value: (r: AdminRegionDetail) => r.currencyCode.toUpperCase() },
  { key: 'taxes', label: t('setRegionAutoTaxes') },
])

// --- create ------------------------------------------------------------------
const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: '', currencyCode: '', automaticTaxes: true, countries: [] as string[] })

function resetDraft() {
  draft.name = ''
  draft.currencyCode = ''
  draft.automaticTaxes = true
  draft.countries = []
}

async function create() {
  if (!draft.name.trim() || !draft.currencyCode) return
  saving.value = true
  try {
    await fetcher('/api/admin/regions', {
      method: 'POST',
      body: {
        name: draft.name.trim(),
        currencyCode: draft.currencyCode,
        automaticTaxes: draft.automaticTaxes,
        countries: draft.countries,
      },
    })
    creating.value = false
    resetDraft()
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- delete ------------------------------------------------------------------
const toDelete = ref<AdminRegionDetail | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/regions/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setRegionsTitle')" :description="t('setRegionsSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setRegionNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; resetDraft()"
      >
        <UFormField :label="t('setRegionName')" name="name" required>
          <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" autofocus />
        </UFormField>

        <UFormField
          :label="t('setRegionCurrency')"
          :description="t('setRegionCurrencyHint')"
          name="currencyCode"
          required
        >
          <USelect
            v-model="draft.currencyCode"
            :items="currencyItems"
            value-key="value"
            size="md"
            class="w-full sm:max-w-md"
          />
        </UFormField>

        <USwitch
          v-model="draft.automaticTaxes"
          :label="t('setRegionAutoTaxes')"
          :description="t('setRegionAutoTaxesHint')"
        />

        <UFormField :label="t('setRegionCountries')" :description="t('setRegionCountriesHint')" name="countries">
          <SettingsCountryPicker v-model="draft.countries" />
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
      :items="regions"
      :columns="columns"
      :loading="loading"
      :to="(r) => `/admin/reglages/zones-de-vente/${r.id}`"
    >
      <template #cell-name="{ item }">
        <span class="font-semibold text-highlighted">{{ item.name }}</span>
      </template>

      <template #cell-currency="{ item }">
        <span class="tabular-nums">{{ item.currencyCode.toUpperCase() }}</span>
      </template>

      <template #cell-taxes="{ item }">
        <PygStatus
          :tone="item.automaticTaxes ? 'success' : 'neutral'"
          :label="item.automaticTaxes ? t('yes') : t('no')"
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
          icon="i-lucide-globe"
          :title="t('setRegionsEmptyTitle')"
          :description="t('setRegionsEmptyDescription')"
          :action-label="t('setRegionNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('setDeleteRegionTitle')"
      :description="t('setDeleteRegionBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
