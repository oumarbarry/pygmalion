<script setup lang="ts">
/**
 * E4 — editing one promotion. The wizard's five questions, stacked instead
 * of paged (the merchant already knows this promotion; a wizard would make
 * them walk through four screens to change one number). Same
 * `PromotionsPromoStep` bodies, so the two screens can never drift.
 *
 * Budget and dates live on the campaign: saving creates one if the merchant
 * just added either, updates it if there already is one, and detaches the
 * promotion (without deleting a possibly shared campaign) if both are gone.
 */
import { draftToPayload, emptyPromotionDraft, promotionDraftError, promotionToDraft, type ApiCampaign, type ApiPromotion, type PromoKind } from '../../../utils/promotion-form'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const route = useRoute()
const promotionId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ promotion: ApiPromotion }>(
  () => `/api/admin/promotions/${promotionId.value}`,
)
const promotion = computed(() => data.value?.promotion ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const campaign = ref<ApiCampaign | null>(null)

const { data: regionData } = useAdminFetch<{ regions: AdminRegion[] }>('/api/admin/regions', { query: { limit: 100 } })
const currencies = computed(() => [...new Set((regionData.value?.regions ?? []).map((r) => r.currencyCode))])

const { data: productData } = useAdminFetch<{ products: AdminProduct[] }>('/api/admin/products', { query: { limit: 100 } })
const products = computed(() => productData.value?.products ?? [])

const { data: categoryData } = useAdminFetch<{ productCategories: AdminCategory[] }>('/api/admin/product-categories', { query: { limit: 200 } })
const categories = computed(() => categoryData.value?.productCategories ?? [])

const { data: groupData } = useAdminFetch<{ groups: AdminCustomerGroup[] }>('/api/admin/customer-groups', { query: { limit: 100 } })
const groups = computed(() => groupData.value?.groups ?? [])

const draft = reactive(emptyPromotionDraft())

watch(promotion, async (value) => {
  if (!value) return
  campaign.value = value.campaignId
    ? (await fetcher<{ campaign: ApiCampaign }>(`/api/admin/campaigns/${value.campaignId}`)).campaign
    : null
  Object.assign(draft, promotionToDraft(value, campaign.value, currencies.value[0] ?? 'eur'))
}, { immediate: true })

/** `type` (standard vs buyget) is not part of the update payload — see BLOCKED E4-B3. */
const lockedKinds = computed<PromoKind[]>(() =>
  promotion.value?.type === 'buyget' ? ['percent', 'amount'] : ['buyget'],
)

const sections = computed(() => [
  { key: 'type' as const, title: t('promoStepType') },
  { key: 'target' as const, title: t('promoStepTarget') },
  { key: 'conditions' as const, title: t('promoStepConditions') },
  { key: 'budget' as const, title: t('promoStepBudget') },
  { key: 'code' as const, title: t('promoStepCode') },
])

const saving = ref(false)
const failure = ref<string | null>(null)

async function save() {
  const problem = promotionDraftError(draft)
  if (problem) {
    failure.value = t(problem)
    return
  }
  saving.value = true
  failure.value = null
  try {
    const name = draft.code.trim().toUpperCase() || campaign.value?.name || t('promoNew')
    const payload = draftToPayload(draft, name, (promotion.value?.status as 'active' | 'inactive' | 'draft') ?? 'active')
    let campaignId: string | null = null
    if (payload.campaign && campaign.value) {
      await fetcher(`/api/admin/campaigns/${campaign.value.id}`, { method: 'POST', body: payload.campaign })
      campaignId = campaign.value.id
    } else if (payload.campaign) {
      const created = await fetcher<{ campaign: { id: string } }>('/api/admin/campaigns', { method: 'POST', body: payload.campaign })
      campaignId = created.campaign.id
    }
    await fetcher(`/api/admin/promotions/${promotionId.value}`, {
      method: 'POST',
      body: {
        ...payload.promotion,
        code: draft.automatic ? null : draft.code.trim().toUpperCase(),
        campaignId,
      },
    })
    await refresh()
  } catch {
    failure.value = t('errorGeneric')
  } finally {
    saving.value = false
  }
}

// --- Start / stop / delete ----------------------------------------------------

const toggling = ref(false)
const confirmingToggle = ref(false)
async function confirmToggle() {
  if (!promotion.value) return
  toggling.value = true
  try {
    await fetcher(`/api/admin/promotions/${promotionId.value}`, {
      method: 'POST',
      body: { status: promotion.value.status === 'active' ? 'inactive' : 'active' },
    })
    confirmingToggle.value = false
    await refresh()
  } finally {
    toggling.value = false
  }
}

const confirmingDelete = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  deleting.value = true
  try {
    await fetcher(`/api/admin/promotions/${promotionId.value}`, { method: 'DELETE' })
    await navigateTo('/admin/promotions')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage
    :title="promotion?.code ?? t('promoAutomaticBadge')"
    :description="t('promoEditSubtitle')"
    back-to="/admin/promotions"
  >
    <template v-if="promotion" #actions>
      <PygStatus
        :tone="promotionStatusDisplay(promotion.status).tone"
        :icon="promotionStatusDisplay(promotion.status).icon"
        :label="t(promotionStatusDisplay(promotion.status).key)"
      />
      <UButton
        :icon="promotion.status === 'active' ? 'i-lucide-circle-pause' : 'i-lucide-circle-play'"
        color="neutral"
        variant="outline"
        size="md"
        :label="promotion.status === 'active' ? t('promoDeactivate') : t('promoActivate')"
        @click="confirmingToggle = true"
      />
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
      <USkeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="error || !promotion"
      icon="i-lucide-tag"
      :title="t('errorTitle')"
      :description="t('promoNotFound')"
      :action-label="t('sectionPromotions')"
      action-to="/admin/promotions"
    />

    <template v-else>
      <UAlert
        v-if="failure"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="t('errorTitle')"
        :description="failure"
      />

      <UCard v-for="section in sections" :key="section.key">
        <template #header>
          <h2 class="font-bold text-highlighted">{{ section.title }}</h2>
        </template>

        <PromotionsPromoStep
          :step="section.key"
          :draft="draft"
          :products="products.map((p) => ({ id: p.id, title: p.title }))"
          :categories="categories.map((c) => ({ id: c.id, name: c.name }))"
          :groups="groups"
          :currencies="currencies"
          :locked-kinds="section.key === 'type' ? lockedKinds : []"
        />
      </UCard>

      <div class="flex justify-end">
        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-check"
          :label="t('promoSaveChanges')"
          :loading="saving"
          block
          class="sm:w-auto"
          @click="save"
        />
      </div>
    </template>

    <PygConfirm
      :open="confirmingToggle"
      :title="promotion?.status === 'active' ? t('promoDeactivateTitle') : t('promoActivateTitle')"
      :description="promotion?.status === 'active' ? t('promoDeactivateBody') : t('promoActivateBody')"
      :confirm-label="promotion?.status === 'active' ? t('promoDeactivate') : t('promoActivate')"
      :danger="promotion?.status === 'active'"
      :loading="toggling"
      @update:open="(value) => confirmingToggle = value"
      @confirm="confirmToggle"
    />

    <PygConfirm
      :open="confirmingDelete"
      :title="t('promoDeleteTitle')"
      :description="t('promoDeleteBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => confirmingDelete = value"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
