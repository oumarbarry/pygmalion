<script setup lang="ts">
/**
 * The promotions list: what the discount is, what it lands on, whether
 * it runs, and how much of its budget is gone.
 *
 * `GET /api/admin/promotions` returns raw rows (no application
 * method, no rules, no status filter, no `count`), so the page loads one
 * page and enriches each row with its detail (N ≤ PAGE, in parallel), then
 * filters client-side. Exactly the orders-list trade-off, same upgrade path.
 */
import { budgetProgress, promotionToDraft, type ApiCampaign, type ApiPromotion } from '../../../utils/promotion-form'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = usePromotionsNav()

const PAGE = 50
type Filter = 'all' | 'active' | 'inactive'

const rows = ref<AdminPromotionRow[]>([])
const details = ref(new Map<string, ApiPromotion>())
const campaigns = ref(new Map<string, ApiCampaign>())
const loading = ref(true)
const failed = ref(false)
const filter = ref<Filter>('all')

async function load() {
  loading.value = true
  failed.value = false
  try {
    const [list, campaignList] = await Promise.all([
      fetcher<{ promotions: AdminPromotionRow[] }>('/api/admin/promotions', { query: { limit: PAGE } }),
      fetcher<{ campaigns: { id: string }[] }>('/api/admin/campaigns', { query: { limit: 100 } }),
    ])
    rows.value = list.promotions
    const loaded = await Promise.all(
      list.promotions.map((r) => fetcher<{ promotion: ApiPromotion }>(`/api/admin/promotions/${r.id}`).then((res) => res.promotion)),
    )
    details.value = new Map(loaded.map((p) => [p.id, p]))
    // Only the list endpoint's campaigns are shallow; budgets need the detail.
    const fullCampaigns = await Promise.all(
      campaignList.campaigns.map((c) => fetcher<{ campaign: ApiCampaign }>(`/api/admin/campaigns/${c.id}`).then((res) => res.campaign)),
    )
    campaigns.value = new Map(fullCampaigns.map((c) => [c.id, c]))
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

/** One row, already read in merchant terms (detail + campaign folded in). */
const enriched = computed(() =>
  rows.value.map((row) => {
    const detail = details.value.get(row.id)
    const campaign = row.campaignId ? (campaigns.value.get(row.campaignId) ?? null) : null
    return {
      ...row,
      draft: detail ? promotionToDraft(detail, campaign) : null,
      budget: budgetProgress(campaign),
    }
  }),
)

const visible = computed(() => enriched.value.filter((r) => (filter.value === 'all' ? true : r.status === filter.value)))

const filters = computed(() => [
  { key: 'all' as const, label: t('cusFilterAll'), icon: 'i-lucide-list' },
  { key: 'active' as const, label: t('promoStatusActive'), icon: 'i-lucide-circle-check' },
  { key: 'inactive' as const, label: t('promoStatusInactive'), icon: 'i-lucide-circle-pause' },
])

const columns = computed(() => [
  { key: 'code', label: t('promoColCode') },
  { key: 'discount', label: t('promoColDiscount') },
  { key: 'target', label: t('promoColTarget') },
  { key: 'usage', label: t('promoColUsage') },
  { key: 'status', label: t('labelStatus') },
])

// --- Start / stop / delete ----------------------------------------------------

const toToggle = ref<AdminPromotionRow | null>(null)
const toggling = ref(false)
async function confirmToggle() {
  if (!toToggle.value) return
  toggling.value = true
  try {
    await fetcher(`/api/admin/promotions/${toToggle.value.id}`, {
      method: 'POST',
      body: { status: toToggle.value.status === 'active' ? 'inactive' : 'active' },
    })
    toToggle.value = null
    await load()
  } finally {
    toggling.value = false
  }
}

const toDelete = ref<AdminPromotionRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/promotions/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await load()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('sectionPromotions')" :description="t('promosSubtitle')">
    <template #actions>
      <UButton to="/admin/promotions/new" icon="i-lucide-plus" size="md" :label="t('promoNew')" />
    </template>

    <PygSubNav :items="navItems" />

    <div class="flex flex-col gap-4">
      <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" :aria-label="t('sectionPromotions')">
        <UButton
          v-for="item in filters"
          :key="item.key"
          role="tab"
          :aria-selected="filter === item.key"
          :color="filter === item.key ? 'primary' : 'neutral'"
          :variant="filter === item.key ? 'soft' : 'ghost'"
          :icon="item.icon"
          :label="item.label"
          class="shrink-0"
          @click="filter = item.key"
        />
      </div>

      <UAlert
        v-if="failed"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="t('errorTitle')"
        :description="t('errorGeneric')"
      >
        <template #actions>
          <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="load()" />
        </template>
      </UAlert>

      <PygList
        v-else
        :items="visible"
        :columns="columns"
        :loading="loading && !rows.length"
        :to="(p) => `/admin/promotions/${p.id}`"
      >
        <template #cell-code="{ item }">
          <span v-if="item.code" class="font-bold text-highlighted">{{ item.code }}</span>
          <PygStatus v-else tone="info" icon="i-lucide-wand-sparkles" :label="t('promoAutomaticBadge')" />
        </template>

        <template #cell-discount="{ item }">
          <template v-if="item.draft">
            <span v-if="item.draft.kind === 'percent'" class="font-semibold text-highlighted">−{{ item.draft.value }} %</span>
            <PygMoney
              v-else-if="item.draft.kind === 'amount'"
              :cents="parseAmountToMinor(item.draft.value, item.draft.currency) ?? 0"
              :currency="item.draft.currency"
              size="sm"
            />
            <span v-else class="text-sm">
              {{ t('promoBuygetFor') }} {{ item.draft.buyQuantity }} {{ t('promoBuygetBought') }}
              {{ item.draft.getQuantity }} {{ t('promoBuygetFree') }}
            </span>
          </template>
          <span v-else>—</span>
        </template>

        <template #cell-target="{ item }">
          {{ item.draft ? t(promotionTargetKey(item.draft.target)) : '—' }}
        </template>

        <template #cell-usage="{ item }">
          <template v-if="item.budget">
            <span v-if="item.budget.type === 'spend'" class="flex items-center gap-1 text-sm">
              <PygMoney :cents="item.budget.used" :currency="item.budget.currency" size="sm" />
              <template v-if="item.budget.limit !== null">
                {{ t('promoUsedOf') }}
                <PygMoney :cents="item.budget.limit" :currency="item.budget.currency" size="sm" />
              </template>
            </span>
            <span v-else class="text-sm">
              {{ item.budget.used }}
              <template v-if="item.budget.limit !== null">{{ t('promoUsedOf') }} {{ item.budget.limit }}</template>
              {{ t('promoUsedTimes') }}
            </span>
          </template>
          <span v-else class="text-sm text-dimmed">{{ t('promoNoBudget') }}</span>
        </template>

        <template #cell-status="{ item }">
          <PygStatus
            :tone="promotionStatusDisplay(item.status).tone"
            :icon="promotionStatusDisplay(item.status).icon"
            :label="t(promotionStatusDisplay(item.status).key)"
          />
        </template>

        <template #actions="{ item }">
          <span class="flex items-center gap-1">
            <UButton
              :icon="item.status === 'active' ? 'i-lucide-circle-pause' : 'i-lucide-circle-play'"
              color="neutral"
              variant="ghost"
              square
              size="md"
              :aria-label="item.status === 'active' ? t('promoDeactivate') : t('promoActivate')"
              @click="toToggle = item"
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
          </span>
        </template>

        <template #empty>
          <PygEmptyState
            icon="i-lucide-tag"
            :title="t('promosEmptyTitle')"
            :description="t('promosEmptyDescription')"
            :action-label="t('promoNew')"
            action-icon="i-lucide-plus"
            action-to="/admin/promotions/new"
          />
        </template>
      </PygList>
    </div>

    <PygConfirm
      :open="Boolean(toToggle)"
      :title="toToggle?.status === 'active' ? t('promoDeactivateTitle') : t('promoActivateTitle')"
      :description="toToggle?.status === 'active' ? t('promoDeactivateBody') : t('promoActivateBody')"
      :confirm-label="toToggle?.status === 'active' ? t('promoDeactivate') : t('promoActivate')"
      :danger="toToggle?.status === 'active'"
      :loading="toggling"
      @update:open="(value) => { if (!value) toToggle = null }"
      @confirm="confirmToggle"
    />

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('promoDeleteTitle')"
      :description="t('promoDeleteBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
