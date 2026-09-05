<script setup lang="ts">
/**
 * Livraison, level 3: one delivered area, the countries it covers and
 * the prices a customer there can pick.
 *
 * Unlike a selling area's countries, a delivered area's geo zones ARE
 * readable (`GET .../service-zones/:zoneId` returns them), so the picker is
 * pre-filled and round-trips.
 *
 * No route reads a shipping option's default price back (`prices` are only
 * listed inside a price list). The price is therefore captured at creation
 * (one extra `POST /admin/prices/batch`) and the edit form says so instead of offering
 * a control that would silently pile up duplicate price rows.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()
const setId = computed(() => String(route.params.id))
const zoneId = computed(() => String(route.params.zoneId))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{
  serviceZone: AdminServiceZone
  geoZones: AdminGeoZone[]
}>(() => `/api/admin/fulfillment-sets/${setId.value}/service-zones/${zoneId.value}`)

const zone = computed(() => data.value?.serviceZone ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const {
  data: optionData,
  status: optionStatus,
  refresh: refreshOptions,
} = useAdminFetch<{ shippingOptions: AdminShippingOption[] }>('/api/admin/shipping-options', {
  query: computed(() => ({ service_zone_id: zoneId.value, limit: 100 })),
})
const options = computed(() => optionData.value?.shippingOptions ?? [])
const optionsLoading = computed(() => optionStatus.value === 'pending')

const { data: profileData } = useAdminFetch<{ shippingProfiles: AdminShippingProfile[] }>(
  '/api/admin/shipping-profiles',
  { query: { limit: 100 } },
)
const profiles = computed(() => profileData.value?.shippingProfiles ?? [])

const { data: providerData } = useAdminFetch<{ fulfillmentProviders: AdminProvider[] }>(
  '/api/admin/fulfillment-providers',
)
const providers = computed(() => providerData.value?.fulfillmentProviders ?? [])

const { data: regionData } = useAdminFetch<{ regions: AdminRegionDetail[] }>('/api/admin/regions', {
  query: { limit: 100 },
})
/** A price needs a currency, and the currencies a store really uses are its selling areas'. */
const currencies = computed(() => [...new Set((regionData.value?.regions ?? []).map((r) => r.currencyCode))].sort())

// --- name + countries -------------------------------------------------------------
const nameDraft = reactive({ name: '' })
const countries = ref<string[]>([])

watchEffect(() => {
  if (!zone.value) return
  nameDraft.name = zone.value.name
  countries.value = (data.value?.geoZones ?? [])
    .filter((g) => g.type === 'country')
    .map((g) => g.countryCode.toUpperCase())
})

const savingZone = ref(false)

async function saveZone() {
  if (!zone.value || !nameDraft.name.trim()) return
  savingZone.value = true
  try {
    await fetcher(`/api/admin/fulfillment-sets/${setId.value}/service-zones/${zoneId.value}`, {
      method: 'POST',
      body: {
        name: nameDraft.name.trim(),
        geoZones: countries.value.map((iso2) => ({ type: 'country', countryCode: iso2.toLowerCase() })),
      },
    })
    await refresh()
  } finally {
    savingZone.value = false
  }
}

// --- delivery prices --------------------------------------------------------------
const columns = computed(() => [
  { key: 'name', label: t('setOptionName'), value: (o: AdminShippingOption) => o.name },
  { key: 'type', label: t('setOptionPriceType') },
  { key: 'profile', label: t('setOptionProfile') },
])

function profileName(id: string): string {
  return profiles.value.find((p) => p.id === id)?.name ?? id
}

const creating = ref(false)
const saving = ref(false)
const draft = reactive({
  name: '',
  shippingProfileId: '',
  providerId: 'manual',
  priceType: 'flat' as 'flat' | 'calculated',
  amount: '',
  currencyCode: '',
})

watchEffect(() => {
  if (!draft.shippingProfileId) {
    draft.shippingProfileId = profiles.value.find((p) => p.isDefault)?.id ?? profiles.value[0]?.id ?? ''
  }
  if (!draft.currencyCode) draft.currencyCode = currencies.value[0] ?? ''
})

const profileItems = computed(() => profiles.value.map((p) => ({ label: p.name, value: p.id })))
const providerItems = computed(() => providers.value.map((p) => ({ label: p.id, value: p.id })))
const priceTypeItems = computed(() => [
  { label: t('setOptionPriceFlat'), value: 'flat' },
  { label: t('setOptionPriceCalculated'), value: 'calculated' },
])
const currencyItems = computed(() => currencies.value.map((c) => ({ label: c.toUpperCase(), value: c })))

function resetDraft() {
  draft.name = ''
  draft.priceType = 'flat'
  draft.amount = ''
}

async function createOption() {
  if (!draft.name.trim() || !draft.shippingProfileId) return
  const minor = draft.priceType === 'flat' ? parseAmountToMinor(draft.amount, draft.currencyCode) : null
  if (draft.priceType === 'flat' && (minor === null || !draft.currencyCode)) return

  saving.value = true
  try {
    const { shippingOption } = await fetcher<{ shippingOption: AdminShippingOption }>('/api/admin/shipping-options', {
      method: 'POST',
      body: {
        name: draft.name.trim(),
        serviceZoneId: zoneId.value,
        shippingProfileId: draft.shippingProfileId,
        providerId: draft.providerId,
        priceType: draft.priceType,
      },
    })
    // ponytail: two calls, no rollback. If the price write fails the option
    // exists with no price: `listOptionsForCart` then just hides it (no price
    // resolved => invisible, not an error) and the toast tells the merchant.
    if (minor !== null) {
      await fetcher('/api/admin/prices/batch', {
        method: 'POST',
        body: { create: [{ shippingOptionId: shippingOption.id, currencyCode: draft.currencyCode, amount: minor }] },
      })
    }
    creating.value = false
    resetDraft()
    await refreshOptions()
  } finally {
    saving.value = false
  }
}

const toDelete = ref<AdminShippingOption | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/shipping-options/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refreshOptions()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage
    :title="zone?.name ?? t('setZonesTitle')"
    :description="t('setOptionsTitle')"
    :back-to="`/admin/settings/shipping/${setId}`"
  >
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setOptionNew')" @click="creating = true" />
    </template>

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
      <USkeleton class="h-64 w-full rounded-2xl" />
      <USkeleton class="h-40 w-full rounded-2xl" />
    </div>

    <template v-else-if="zone">
      <UCard>
        <PygForm :state="nameDraft" :loading="savingZone" :show-cancel="false" @submit="saveZone">
          <UFormField :label="t('setZoneName')" name="name" required>
            <UInput v-model="nameDraft.name" size="md" class="w-full sm:max-w-md" />
          </UFormField>
          <UFormField :label="t('setZoneCountries')" :description="t('setZoneCountriesHint')" name="countries">
            <SettingsCountryPicker v-model="countries" />
          </UFormField>
        </PygForm>
      </UCard>

      <UCard v-if="creating">
        <PygForm
          :state="draft"
          :loading="saving"
          :submit-label="t('create')"
          @submit="createOption"
          @cancel="creating = false; resetDraft()"
        >
          <UAlert
            v-if="!currencies.length"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="t('setNoCurrencyForOption')"
          />

          <UFormField :label="t('setOptionName')" name="name" required>
            <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" autofocus />
          </UFormField>

          <UFormField :label="t('setOptionProfile')" name="shippingProfileId" required>
            <USelect
              v-model="draft.shippingProfileId"
              :items="profileItems"
              value-key="value"
              size="md"
              class="w-full sm:max-w-md"
            />
          </UFormField>

          <UFormField
            :label="t('setOptionPriceType')"
            :description="t('setOptionPriceTypeHint')"
            name="priceType"
          >
            <USelect
              v-model="draft.priceType"
              :items="priceTypeItems"
              value-key="value"
              size="md"
              class="w-full sm:max-w-md"
            />
          </UFormField>

          <div v-if="draft.priceType === 'flat'" class="flex flex-col sm:flex-row gap-3">
            <UFormField
              :label="t('setOptionPrice')"
              :description="t('setOptionPriceHint')"
              name="amount"
              class="sm:w-48"
              required
            >
              <UInput v-model="draft.amount" inputmode="decimal" size="md" class="w-full" />
            </UFormField>
            <UFormField :label="t('setRegionCurrency')" name="currencyCode" class="sm:w-40" required>
              <USelect
                v-model="draft.currencyCode"
                :items="currencyItems"
                value-key="value"
                size="md"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField :label="t('setOptionCarrier')" name="providerId">
            <USelect
              v-model="draft.providerId"
              :items="providerItems"
              value-key="value"
              size="md"
              class="w-full sm:max-w-md"
            />
          </UFormField>
        </PygForm>
      </UCard>

      <UAlert
        color="info"
        variant="soft"
        icon="i-lucide-info"
        :description="t('setOptionPriceWriteOnly')"
      />

      <PygList :items="options" :columns="columns" :loading="optionsLoading">
        <template #cell-name="{ item }">
          <span class="font-semibold text-highlighted">{{ item.name }}</span>
        </template>

        <template #cell-type="{ item }">
          <PygStatus
            :tone="item.priceType === 'flat' ? 'info' : 'neutral'"
            :label="item.priceType === 'flat' ? t('setOptionPriceFlat') : t('setOptionPriceCalculated')"
            :icon="item.priceType === 'flat' ? 'i-lucide-tag' : 'i-lucide-calculator'"
          />
        </template>

        <template #cell-profile="{ item }">
          <span class="text-sm text-muted">{{ profileName(item.shippingProfileId) }}</span>
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
            icon="i-lucide-tag"
            :title="t('setOptionsEmptyTitle')"
            :description="t('setOptionsEmptyDescription')"
            :action-label="t('setOptionNew')"
            action-icon="i-lucide-plus"
            @action="creating = true"
          />
        </template>
      </PygList>
    </template>

    <UCard v-else>
      <PygEmptyState
        icon="i-lucide-map"
        :title="t('setNotFound')"
        :description="t('setZonesEmptyDescription')"
        :action-label="t('back')"
        :action-to="`/admin/settings/shipping/${setId}`"
      />
    </UCard>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('setDeleteOptionTitle')"
      :description="t('setDeleteOptionBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
