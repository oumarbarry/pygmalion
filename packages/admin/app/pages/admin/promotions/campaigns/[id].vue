<script setup lang="ts">
/**
 * E4 — one campaign: its period, its budget, and the promotions that share
 * them. This is also where a campaign the promotion wizard created on the
 * merchant's behalf (budget/dates on a single promotion) can be renamed or
 * widened to other promotions.
 */
import { budgetProgress, type ApiCampaign } from '../../../../utils/promotion-form'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const route = useRoute()
const campaignId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ campaign: ApiCampaign }>(
  () => `/api/admin/campaigns/${campaignId.value}`,
)
const campaign = computed(() => data.value?.campaign ?? null)
const loading = computed(() => fetchStatus.value === 'pending')
const budget = computed(() => budgetProgress(campaign.value))

const { data: regionData } = useAdminFetch<{ regions: AdminRegion[] }>('/api/admin/regions', { query: { limit: 100 } })
const currencies = computed(() => [...new Set((regionData.value?.regions ?? []).map((r) => r.currencyCode))])

const form = reactive({
  name: '',
  description: '',
  startsAt: '',
  endsAt: '',
  budgetKind: 'none' as 'none' | 'spend' | 'usage',
  budgetLimit: '',
  currency: 'eur',
})

watch(campaign, (value) => {
  if (!value) return
  form.name = value.name
  form.description = value.description ?? ''
  form.startsAt = value.startsAt?.slice(0, 10) ?? ''
  form.endsAt = value.endsAt?.slice(0, 10) ?? ''
  form.currency = value.budget?.currencyCode ?? currencies.value[0] ?? 'eur'
  form.budgetKind = value.budget?.type === 'spend' ? 'spend' : value.budget?.type === 'usage' ? 'usage' : 'none'
  form.budgetLimit = value.budget?.limitAmount === null || !value.budget
    ? ''
    : value.budget.type === 'spend'
      ? minorToAmountInput(value.budget.limitAmount, form.currency)
      : String(value.budget.limitAmount)
}, { immediate: true })

const budgetKinds = computed(() => [
  { value: 'none' as const, label: t('promoBudgetNone') },
  { value: 'spend' as const, label: t('promoBudgetSpend') },
  { value: 'usage' as const, label: t('promoBudgetUsage') },
])

const saving = ref(false)
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const limit = form.budgetKind === 'spend'
      ? parseAmountToMinor(form.budgetLimit, form.currency)
      : form.budgetKind === 'usage'
        ? Number.parseInt(form.budgetLimit, 10)
        : null
    const hasBudget = form.budgetKind !== 'none' && limit !== null && Number.isFinite(limit) && limit > 0
    await fetcher(`/api/admin/campaigns/${campaignId.value}`, {
      method: 'POST',
      body: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        budget: hasBudget
          ? {
              type: form.budgetKind,
              ...(form.budgetKind === 'spend' ? { currencyCode: form.currency } : {}),
              limitAmount: limit,
            }
          : null,
      },
    })
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- Promotions in this campaign ---------------------------------------------

const { data: promotionData, refresh: refreshPromotions } = useAdminFetch<{ promotions: AdminPromotionRow[] }>(
  '/api/admin/promotions',
  { query: { limit: 100 } },
)
const attachable = computed(() => (promotionData.value?.promotions ?? []).filter((p) => p.campaignId !== campaignId.value))
const attached = computed(() => (campaign.value?.promotions ?? []).map((p) => ({ id: p.id, code: p.code })))

const promotionToAdd = ref('')
async function attach() {
  if (!promotionToAdd.value) return
  await fetcher(`/api/admin/campaigns/${campaignId.value}/promotions`, {
    method: 'POST',
    body: { add: [promotionToAdd.value] },
  })
  promotionToAdd.value = ''
  await Promise.all([refresh(), refreshPromotions()])
}

const toDetach = ref<{ id: string; code: string | null } | null>(null)
const detaching = ref(false)
async function confirmDetach() {
  if (!toDetach.value) return
  detaching.value = true
  try {
    await fetcher(`/api/admin/campaigns/${campaignId.value}/promotions`, {
      method: 'POST',
      body: { remove: [toDetach.value.id] },
    })
    toDetach.value = null
    await Promise.all([refresh(), refreshPromotions()])
  } finally {
    detaching.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  deleting.value = true
  try {
    await fetcher(`/api/admin/campaigns/${campaignId.value}`, { method: 'DELETE' })
    await navigateTo('/admin/promotions/campaigns')
  } finally {
    deleting.value = false
  }
}

const columns = computed(() => [{ key: 'code', label: t('promoColCode') }])
</script>

<template>
  <PygPage :title="campaign?.name ?? t('loading')" back-to="/admin/promotions/campaigns">
    <template v-if="campaign" #actions>
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        square
        size="md"
        :aria-label="t('delete')"
        @click="confirmingDelete = true"
      />
    </template>

    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 2" :key="n" class="h-24 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="error || !campaign"
      icon="i-lucide-megaphone"
      :title="t('errorTitle')"
      :description="t('campaignNotFound')"
      :action-label="t('campaignsTitle')"
      action-to="/admin/promotions/campaigns"
    />

    <template v-else>
      <UCard>
        <div class="flex flex-col gap-4">
          <p class="text-sm text-muted">{{ t('campaignAutoHint') }}</p>

          <PygForm :state="form" :loading="saving" :show-cancel="false" :submit-label="t('save')" @submit="save">
            <UFormField :label="t('campaignNameLabel')" name="name" required>
              <UInput v-model="form.name" size="md" class="w-full" />
            </UFormField>

            <UFormField :label="t('campaignDescriptionLabel')" name="description">
              <UInput v-model="form.description" size="md" class="w-full" />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('promoStartsAt')" name="startsAt">
                <UInput v-model="form.startsAt" type="date" size="md" class="w-full" />
              </UFormField>
              <UFormField :label="t('promoEndsAt')" :description="t('promoDatesHint')" name="endsAt">
                <UInput v-model="form.endsAt" type="date" size="md" class="w-full" />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('campaignColBudget')" name="budgetKind">
                <USelect
                  v-model="form.budgetKind"
                  :items="budgetKinds"
                  value-key="value"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                v-if="form.budgetKind !== 'none'"
                :label="form.budgetKind === 'spend' ? t('promoBudgetLimitLabel') : t('promoBudgetCountLabel')"
                name="budgetLimit"
              >
                <UInput v-model="form.budgetLimit" size="md" class="w-full" inputmode="decimal" />
              </UFormField>
              <UFormField v-if="form.budgetKind === 'spend'" :label="t('promoCurrencyLabel')" name="currency">
                <USelect
                  v-model="form.currency"
                  :items="currencies.map((c) => ({ label: c.toUpperCase(), value: c }))"
                  value-key="value"
                  size="md"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div v-if="budget" class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-dimmed">{{ t('promoBudgetSpent') }}</span>
              <PygMoney v-if="budget.type === 'spend'" :cents="budget.used" :currency="budget.currency" size="md" />
              <span v-else class="font-semibold text-highlighted">{{ budget.used }} {{ t('promoUsedTimes') }}</span>
            </div>
          </PygForm>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted">{{ t('campaignPromotions') }}</h2>
        </template>

        <div class="flex flex-col gap-4">
          <div v-if="attachable.length" class="flex flex-col sm:flex-row sm:items-end gap-3">
            <UFormField :label="t('campaignAddPromotion')" name="add-promotion" class="flex-1">
              <USelect
                v-model="promotionToAdd"
                :items="attachable.map((p) => ({ label: p.code ?? t('promoAutomaticBadge'), value: p.id }))"
                value-key="value"
                size="md"
                class="w-full"
                :placeholder="t('campaignAddPromotionPlaceholder')"
              />
            </UFormField>
            <UButton icon="i-lucide-plus" size="md" :label="t('add')" :disabled="!promotionToAdd" @click="attach" />
          </div>

          <PygList :items="attached" :columns="columns" :to="(p) => `/admin/promotions/${p.id}`">
            <template #cell-code="{ item }">
              <span class="font-bold text-highlighted">{{ item.code ?? t('promoAutomaticBadge') }}</span>
            </template>

            <template #actions="{ item }">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                square
                size="md"
                :aria-label="t('remove')"
                @click="toDetach = item"
              />
            </template>

            <template #empty>
              <PygEmptyState
                icon="i-lucide-tag"
                :title="t('campaignPromotionsEmptyTitle')"
                :description="t('campaignPromotionsEmptyDescription')"
              />
            </template>
          </PygList>
        </div>
      </UCard>
    </template>

    <PygConfirm
      :open="Boolean(toDetach)"
      :title="t('campaignDetachTitle')"
      :description="t('campaignDetachBody')"
      :confirm-label="t('remove')"
      :loading="detaching"
      @update:open="(value) => { if (!value) toDetach = null }"
      @confirm="confirmDetach"
    />

    <PygConfirm
      :open="confirmingDelete"
      :title="t('campaignDeleteTitle')"
      :description="t('campaignDeleteBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => confirmingDelete = value"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
