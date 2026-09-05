<script setup lang="ts">
/**
 * One selling area: rename, change currency, switch automatic tax off,
 * and (separately) replace the countries it serves.
 *
 * No route returns `region_country`, so the countries currently attached
 * CANNOT be read back.
 * `POST /admin/regions/:id { countries }` has replace-set semantics, so the
 * picker is isolated in its own block with an explicit "this replaces the
 * whole list" warning rather than sitting silently empty inside the main form
 * — a form that always shows "no country" would erase the real list on every
 * unrelated save.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()
const regionId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ region: AdminRegionDetail }>(
  () => `/api/admin/regions/${regionId.value}`,
)
const region = computed(() => data.value?.region ?? null)
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

const draft = reactive({ name: '', currencyCode: '', automaticTaxes: true })

watchEffect(() => {
  if (!region.value) return
  draft.name = region.value.name
  draft.currencyCode = region.value.currencyCode
  draft.automaticTaxes = region.value.automaticTaxes
})

const saving = ref(false)

async function save() {
  if (!region.value || !draft.name.trim()) return
  saving.value = true
  try {
    await fetcher(`/api/admin/regions/${region.value.id}`, {
      method: 'POST',
      body: { name: draft.name.trim(), currencyCode: draft.currencyCode, automaticTaxes: draft.automaticTaxes },
    })
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- countries (write-only, see the file header) --------------------------------
const countries = ref<string[]>([])
const savingCountries = ref(false)
const countriesSaved = ref(false)

async function saveCountries() {
  if (!region.value) return
  savingCountries.value = true
  countriesSaved.value = false
  try {
    await fetcher(`/api/admin/regions/${region.value.id}`, {
      method: 'POST',
      body: { countries: countries.value },
    })
    countriesSaved.value = true
  } finally {
    savingCountries.value = false
  }
}
</script>

<template>
  <PygPage
    :title="region?.name ?? t('setRegionsTitle')"
    :description="t('setRegionsSubtitle')"
    back-to="/admin/settings/regions"
  >
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
      <USkeleton class="h-56 w-full rounded-2xl" />
      <USkeleton class="h-64 w-full rounded-2xl" />
    </div>

    <template v-else-if="region">
      <UCard>
        <PygForm :state="draft" :loading="saving" :show-cancel="false" @submit="save">
          <UFormField :label="t('setRegionName')" name="name" required>
            <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" />
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
        </PygForm>
      </UCard>

      <UCard>
        <div class="flex flex-col gap-5">
          <div>
            <h2 class="text-lg font-bold text-highlighted">{{ t('setRegionCountries') }}</h2>
            <p class="text-sm text-muted mt-1">{{ t('setRegionCountriesHint') }}</p>
          </div>

          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="t('setRegionCountriesWriteOnly')"
          />

          <SettingsCountryPicker v-model="countries" />

          <UAlert
            v-if="countriesSaved"
            color="success"
            variant="soft"
            icon="i-lucide-circle-check"
            :description="t('setRegionCountriesSaved')"
          />

          <div class="flex justify-end">
            <UButton
              color="primary"
              size="md"
              block
              class="sm:w-auto"
              :label="t('setRegionCountriesReplace')"
              :loading="savingCountries"
              @click="saveCountries"
            />
          </div>
        </div>
      </UCard>
    </template>

    <UCard v-else>
      <PygEmptyState
        icon="i-lucide-globe"
        :title="t('setNotFound')"
        :description="t('setRegionsEmptyDescription')"
        :action-label="t('back')"
        action-to="/admin/settings/regions"
      />
    </UCard>
  </PygPage>
</template>
