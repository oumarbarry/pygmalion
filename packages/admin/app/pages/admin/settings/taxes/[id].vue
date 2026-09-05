<script setup lang="ts">
/**
 * Taxes, level 2: the rates charged in one country (or province).
 *
 * « Taux par défaut » vs « produits au taux réduit » is the whole model in
 * plain words: one rate applies to everything, the others only to the
 * products (or delivery prices) explicitly listed on them.
 *
 * The engine matches a rule on `product`, `product_type` or `shipping_option`
 * (services/tax.ts::rateRank). Collections are NOT a tax reference here, so
 * the picker offers the two references that really fire rather than a
 * collection option that would silently never match.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useVocabulary()
const { tag } = useAdminFormat()
const fetcher = useAdminApi()
const navItems = useSettingsNav()
const taxRegionId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ taxRegion: AdminTaxRegion }>(
  () => `/api/admin/tax-regions/${taxRegionId.value}`,
)
const taxRegion = computed(() => data.value?.taxRegion ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const {
  data: rateData,
  status: rateStatus,
  refresh: refreshRates,
} = useAdminFetch<{ taxRates: AdminTaxRate[] }>('/api/admin/tax-rates', {
  query: computed(() => ({ tax_region_id: taxRegionId.value, limit: 100 })),
})
const rates = computed(() => rateData.value?.taxRates ?? [])
const ratesLoading = computed(() => rateStatus.value === 'pending')

const title = computed(() => {
  if (!taxRegion.value) return t('setTaxesTitle')
  const country = countryName(taxRegion.value.countryCode, tag.value)
  return taxRegion.value.provinceCode ? `${country} — ${taxRegion.value.provinceCode.toUpperCase()}` : country
})

const columns = computed(() => [
  { key: 'name', label: t('setTaxRateName'), value: (r: AdminTaxRate) => r.name },
  { key: 'rate', label: t('setTaxRatePercent') },
  { key: 'scope', label: t('setTaxRateDefault') },
])

// --- create ------------------------------------------------------------------
const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: '', code: '', rate: '', isDefault: false, isCombinable: false })

function resetDraft() {
  draft.name = ''
  draft.code = ''
  draft.rate = ''
  draft.isDefault = false
  draft.isCombinable = false
}

async function createRate() {
  const percent = Number(draft.rate.replace(',', '.'))
  if (!draft.name.trim() || !draft.code.trim() || !Number.isFinite(percent)) return
  saving.value = true
  try {
    await fetcher('/api/admin/tax-rates', {
      method: 'POST',
      body: {
        taxRegionId: taxRegionId.value,
        name: draft.name.trim(),
        code: draft.code.trim(),
        rate: percent,
        isDefault: draft.isDefault,
        isCombinable: draft.isCombinable,
      },
    })
    creating.value = false
    resetDraft()
    await refreshRates()
  } finally {
    saving.value = false
  }
}

// --- selected rate: edit + overrides --------------------------------------------
const selected = ref<AdminTaxRate | null>(null)
const selectedDraft = reactive({ name: '', code: '', rate: '', isDefault: false, isCombinable: false })
const updating = ref(false)

async function selectRate(rate: AdminTaxRate) {
  const { taxRate } = await fetcher<{ taxRate: AdminTaxRate }>(`/api/admin/tax-rates/${rate.id}`)
  selected.value = taxRate
  selectedDraft.name = taxRate.name
  selectedDraft.code = taxRate.code
  selectedDraft.rate = String(taxRate.rate ?? '')
  selectedDraft.isDefault = taxRate.isDefault
  selectedDraft.isCombinable = taxRate.isCombinable
}

async function reloadSelected() {
  if (!selected.value) return
  const { taxRate } = await fetcher<{ taxRate: AdminTaxRate }>(`/api/admin/tax-rates/${selected.value.id}`)
  selected.value = taxRate
}

async function updateRate() {
  if (!selected.value) return
  const percent = Number(selectedDraft.rate.replace(',', '.'))
  if (!selectedDraft.name.trim() || !Number.isFinite(percent)) return
  updating.value = true
  try {
    await fetcher(`/api/admin/tax-rates/${selected.value.id}`, {
      method: 'POST',
      body: {
        name: selectedDraft.name.trim(),
        code: selectedDraft.code.trim(),
        rate: percent,
        isDefault: selectedDraft.isDefault,
        isCombinable: selectedDraft.isCombinable,
      },
    })
    await Promise.all([refreshRates(), reloadSelected()])
  } finally {
    updating.value = false
  }
}

// --- overrides (tax_rate_rule) --------------------------------------------------
const { data: productData } = useAdminFetch<{ products: AdminProduct[] }>('/api/admin/products', {
  query: { limit: 100 },
})
const { data: optionData } = useAdminFetch<{ shippingOptions: AdminShippingOption[] }>('/api/admin/shipping-options', {
  query: { limit: 100 },
})

const overrideDraft = reactive({ reference: 'product' as 'product' | 'shipping_option', referenceId: '' })
const addingOverride = ref(false)

const referenceItems = computed(() => [
  { label: t('setTaxOverrideProduct'), value: 'product' },
  { label: t('setTaxOverrideShipping'), value: 'shipping_option' },
])
const targetItems = computed(() =>
  overrideDraft.reference === 'product'
    ? (productData.value?.products ?? []).map((p) => ({ label: p.title, value: p.id }))
    : (optionData.value?.shippingOptions ?? []).map((o) => ({ label: o.name, value: o.id })),
)
watch(() => overrideDraft.reference, () => { overrideDraft.referenceId = '' })

function overrideLabel(rule: AdminTaxRateRule): string {
  if (rule.reference === 'product') {
    return productData.value?.products.find((p) => p.id === rule.referenceId)?.title ?? rule.referenceId
  }
  return optionData.value?.shippingOptions.find((o) => o.id === rule.referenceId)?.name ?? rule.referenceId
}

async function addOverride() {
  if (!selected.value || !overrideDraft.referenceId) return
  addingOverride.value = true
  try {
    await fetcher(`/api/admin/tax-rates/${selected.value.id}/rules`, {
      method: 'POST',
      body: { reference: overrideDraft.reference, referenceId: overrideDraft.referenceId },
    })
    overrideDraft.referenceId = ''
    await reloadSelected()
  } finally {
    addingOverride.value = false
  }
}

async function removeOverride(ruleId: string) {
  if (!selected.value) return
  await fetcher(`/api/admin/tax-rates/${selected.value.id}/rules/${ruleId}`, { method: 'DELETE' })
  await reloadSelected()
}

// --- delete ------------------------------------------------------------------
const toDelete = ref<AdminTaxRate | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/tax-rates/${toDelete.value.id}`, { method: 'DELETE' })
    if (selected.value?.id === toDelete.value.id) selected.value = null
    toDelete.value = null
    await refreshRates()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="title" :description="t('setTaxRateSubtitle')" back-to="/admin/settings/taxes">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setTaxRateNew')" @click="creating = true" />
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
      <USkeleton class="h-48 w-full rounded-2xl" />
    </div>

    <template v-else-if="taxRegion">
      <UCard v-if="creating">
        <PygForm
          :state="draft"
          :loading="saving"
          :submit-label="t('create')"
          @submit="createRate"
          @cancel="creating = false; resetDraft()"
        >
          <UFormField :label="t('setTaxRateName')" :description="t('setTaxRateNameHint')" name="name" required>
            <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" autofocus />
          </UFormField>

          <UFormField :label="t('setTaxRateCode')" :description="t('setTaxRateCodeHint')" name="code" required>
            <UInput v-model="draft.code" size="md" class="w-full sm:max-w-xs" />
          </UFormField>

          <UFormField :label="t('setTaxRatePercent')" :description="t('setTaxRatePercentHint')" name="rate" required>
            <UInput v-model="draft.rate" inputmode="decimal" size="md" class="w-full sm:max-w-32" />
          </UFormField>

          <USwitch v-model="draft.isDefault" :label="t('setTaxRateDefault')" :description="t('setTaxRateDefaultHint')" />
          <USwitch
            v-model="draft.isCombinable"
            :label="t('setTaxRateCombinable')"
            :description="t('setTaxRateCombinableHint')"
          />
        </PygForm>
      </UCard>

      <PygList :items="rates" :columns="columns" :loading="ratesLoading">
        <template #cell-name="{ item }">
          <span class="font-semibold text-highlighted">{{ item.name }}</span>
          <span class="block text-xs text-muted">{{ item.code }}</span>
        </template>

        <template #cell-rate="{ item }">
          <span class="text-lg font-bold tabular-nums">{{ item.rate ?? 0 }} %</span>
        </template>

        <template #cell-scope="{ item }">
          <PygStatus
            :tone="item.isDefault ? 'success' : 'info'"
            :label="item.isDefault ? t('setTaxRateDefault') : t('setTaxOverridesTitle')"
            :icon="item.isDefault ? 'i-lucide-circle-check' : 'i-lucide-filter'"
          />
        </template>

        <template #actions="{ item }">
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              square
              size="md"
              :aria-label="t('edit')"
              @click="selectRate(item)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              square
              size="md"
              :aria-label="t('delete')"
              @click="toDelete = item"
            />
          </div>
        </template>

        <template #empty>
          <PygEmptyState
            icon="i-lucide-percent"
            :title="t('setTaxRatesEmptyTitle')"
            :description="t('setTaxRatesEmptyDescription')"
            :action-label="t('setTaxRateNew')"
            action-icon="i-lucide-plus"
            @action="creating = true"
          />
        </template>
      </PygList>

      <UCard v-if="selected">
        <div class="flex flex-col gap-6">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-lg font-bold text-highlighted">{{ selected.name }}</h2>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              square
              size="md"
              :aria-label="t('setClose')"
              @click="selected = null"
            />
          </div>

          <PygForm :state="selectedDraft" :loading="updating" :show-cancel="false" @submit="updateRate">
            <UFormField :label="t('setTaxRateName')" name="name" required>
              <UInput v-model="selectedDraft.name" size="md" class="w-full sm:max-w-md" />
            </UFormField>
            <UFormField :label="t('setTaxRateCode')" name="code" required>
              <UInput v-model="selectedDraft.code" size="md" class="w-full sm:max-w-xs" />
            </UFormField>
            <UFormField :label="t('setTaxRatePercent')" name="rate" required>
              <UInput v-model="selectedDraft.rate" inputmode="decimal" size="md" class="w-full sm:max-w-32" />
            </UFormField>
            <USwitch v-model="selectedDraft.isDefault" :label="t('setTaxRateDefault')" />
            <USwitch v-model="selectedDraft.isCombinable" :label="t('setTaxRateCombinable')" />
          </PygForm>

          <div class="flex flex-col gap-3 border-t border-default pt-5">
            <div>
              <h3 class="text-base font-semibold text-highlighted">{{ t('setTaxOverridesTitle') }}</h3>
              <p class="text-sm text-muted mt-1">{{ t('setTaxOverridesHint') }}</p>
            </div>

            <ul v-if="selected.rules?.length" class="flex flex-col gap-2">
              <li
                v-for="rule in selected.rules"
                :key="rule.id"
                class="flex items-center justify-between gap-3 rounded-xl border border-default px-4 py-2"
              >
                <div class="min-w-0">
                  <p class="text-sm text-default truncate">{{ overrideLabel(rule) }}</p>
                  <p class="text-xs text-dimmed">
                    {{ rule.reference === 'product' ? t('setTaxOverrideProduct') : t('setTaxOverrideShipping') }}
                  </p>
                </div>
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  square
                  size="md"
                  :aria-label="t('remove')"
                  @click="removeOverride(rule.id)"
                />
              </li>
            </ul>
            <p v-else class="text-sm text-muted">{{ t('setTaxOverridesEmpty') }}</p>

            <div class="flex flex-col sm:flex-row sm:items-end gap-3">
              <UFormField :label="t('setTaxOverrideAdd')" name="reference" class="sm:w-52">
                <USelect
                  v-model="overrideDraft.reference"
                  :items="referenceItems"
                  value-key="value"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="t('labelTitle')" name="referenceId" class="flex-1">
                <USelect
                  v-model="overrideDraft.referenceId"
                  :items="targetItems"
                  value-key="value"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UButton
                icon="i-lucide-plus"
                size="md"
                :label="t('add')"
                :loading="addingOverride"
                :disabled="!overrideDraft.referenceId"
                @click="addOverride"
              />
            </div>
          </div>
        </div>
      </UCard>
    </template>

    <UCard v-else>
      <PygEmptyState
        icon="i-lucide-percent"
        :title="t('setNotFound')"
        :description="t('setTaxRegionsEmptyDescription')"
        :action-label="t('back')"
        action-to="/admin/settings/taxes"
      />
    </UCard>
  </PygPage>
</template>
