<script setup lang="ts">
/**
 * Campaigns: the budget and the period several promotions share.
 * Creation asks for the name only (one question to get started); the
 * budget, the dates and the promotions are set on the campaign's own page.
 *
 * `GET /api/admin/campaigns` returns raw rows without their
 * budget, so the page enriches each one with its detail, same trade-off as
 * the promotions list.
 */
import { budgetProgress, type ApiCampaign } from '../../../../utils/promotion-form'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = usePromotionsNav()

const campaigns = ref<ApiCampaign[]>([])
const loading = ref(true)
const failed = ref(false)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const { campaigns: rows } = await fetcher<{ campaigns: { id: string }[] }>('/api/admin/campaigns', { query: { limit: 100 } })
    campaigns.value = await Promise.all(
      rows.map((c) => fetcher<{ campaign: ApiCampaign }>(`/api/admin/campaigns/${c.id}`).then((res) => res.campaign)),
    )
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

const enriched = computed(() => campaigns.value.map((c) => ({ ...c, budget: budgetProgress(c) })))

const columns = computed(() => [
  { key: 'name', label: t('campaignColName') },
  { key: 'period', label: t('campaignColPeriod') },
  { key: 'budget', label: t('campaignColBudget') },
  { key: 'promotions', label: t('campaignColPromotions') },
])

const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: '' })

async function create() {
  if (!draft.name.trim()) return
  saving.value = true
  try {
    const { campaign } = await fetcher<{ campaign: { id: string } }>('/api/admin/campaigns', {
      method: 'POST',
      body: { name: draft.name.trim() },
    })
    draft.name = ''
    creating.value = false
    await navigateTo(`/admin/promotions/campagnes/${campaign.id}`)
  } finally {
    saving.value = false
  }
}

const { formatDate } = useAdminFormat()
</script>

<template>
  <PygPage :title="t('campaignsTitle')" :description="t('campaignsSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('campaignNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; draft.name = ''"
      >
        <UFormField :label="t('campaignNameLabel')" name="name" required>
          <UInput v-model="draft.name" size="md" class="w-full" autofocus />
        </UFormField>
      </PygForm>
    </UCard>

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
      :items="enriched"
      :columns="columns"
      :loading="loading && !campaigns.length"
      :to="(c) => `/admin/promotions/campagnes/${c.id}`"
    >
      <template #cell-name="{ item }">
        <span class="font-semibold text-highlighted">{{ item.name }}</span>
      </template>

      <template #cell-period="{ item }">
        <span v-if="item.startsAt || item.endsAt" class="text-sm">
          <template v-if="item.startsAt">{{ t('promoFrom') }} {{ formatDate(item.startsAt) }}</template>
          <template v-if="item.endsAt"> {{ t('promoUntil') }} {{ formatDate(item.endsAt) }}</template>
        </span>
        <span v-else class="text-sm text-dimmed">{{ t('promoNoDates') }}</span>
      </template>

      <template #cell-budget="{ item }">
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

      <template #cell-promotions="{ item }">
        {{ item.promotions?.length ?? 0 }}
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-megaphone"
          :title="t('campaignsEmptyTitle')"
          :description="t('campaignsEmptyDescription')"
          :action-label="t('campaignNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>
  </PygPage>
</template>
