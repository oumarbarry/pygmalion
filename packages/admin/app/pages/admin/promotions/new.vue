<script setup lang="ts">
/**
 * Creating a promotion, guided: one question per
 * screen, plain-language summary, then it goes live.
 *
 * Two calls, one intention: a budget or an end date lives on a *campaign*
 * (the promotion table carries neither), so the summary screen creates a
 * campaign named after the code first, then the promotion attached to it.
 * With neither, no campaign is created at all — the Campagnes screen stays
 * about real, merchant-made operations.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()

const { data: regionData } = useAdminFetch<{ regions: AdminRegion[] }>('/api/admin/regions', { query: { limit: 100 } })
const currencies = computed(() => [...new Set((regionData.value?.regions ?? []).map((r) => r.currencyCode))])

const { data: productData } = useAdminFetch<{ products: AdminProduct[] }>('/api/admin/products', { query: { limit: 100 } })
const products = computed(() => productData.value?.products ?? [])

const { data: categoryData } = useAdminFetch<{ productCategories: AdminCategory[] }>('/api/admin/product-categories', { query: { limit: 200 } })
const categories = computed(() => categoryData.value?.productCategories ?? [])

const { data: groupData } = useAdminFetch<{ groups: AdminCustomerGroup[] }>('/api/admin/customer-groups', { query: { limit: 100 } })
const groups = computed(() => groupData.value?.groups ?? [])

const draft = reactive(emptyPromotionDraft())
watch(currencies, (list) => {
  if (list.length && !list.includes(draft.currency)) draft.currency = list[0]!
}, { immediate: true })

const steps = computed(() => [
  { key: 'type', title: t('promoStepType'), description: t('promoStepTypeDescription') },
  { key: 'target', title: t('promoStepTarget'), description: t('promoStepTargetDescription') },
  { key: 'conditions', title: t('promoStepConditions'), description: t('promoStepConditionsDescription') },
  { key: 'budget', title: t('promoStepBudget'), description: t('promoStepBudgetDescription') },
  { key: 'code', title: t('promoStepCode'), description: t('promoStepCodeDescription') },
])

const current = ref(0)
const saving = ref(false)
const failure = ref<string | null>(null)

const amountCents = computed(() => parseAmountToMinor(draft.value, draft.currency))
const minSubtotalCents = computed(() => parseAmountToMinor(draft.minSubtotal, draft.currency))
const budgetCents = computed(() => parseAmountToMinor(draft.budgetLimit, draft.currency))
const chosenGroups = computed(() => groups.value.filter((g) => draft.groupIds.includes(g.id)))

async function create() {
  const problem = promotionDraftError(draft)
  if (problem) {
    failure.value = t(problem)
    return
  }
  saving.value = true
  failure.value = null
  try {
    const { campaign, promotion } = draftToPayload(draft, draft.code.trim().toUpperCase() || t('promoNew'))
    let campaignId: string | undefined
    if (campaign) {
      const created = await fetcher<{ campaign: { id: string } }>('/api/admin/campaigns', { method: 'POST', body: campaign })
      campaignId = created.campaign.id
    }
    const created = await fetcher<{ promotion: { id: string } }>('/api/admin/promotions', {
      method: 'POST',
      body: { ...promotion, ...(campaignId ? { campaignId } : {}) },
    })
    await navigateTo(`/admin/promotions/${created.promotion.id}`)
  } catch {
    failure.value = t('errorGeneric')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PygPage :title="t('promoNew')" :description="t('promosSubtitle')" back-to="/admin/promotions">
    <UCard>
      <PygWizard
        v-model="current"
        :steps="steps"
        :loading="saving"
        :finish-label="t('promoCreateAction')"
        @finish="create"
      >
        <template v-for="step in steps" :key="step.key" #[`step-${step.key}`]>
          <PromotionsPromoStep
            :step="(step.key as 'type' | 'target' | 'conditions' | 'budget' | 'code')"
            :draft="draft"
            :products="products.map((p) => ({ id: p.id, title: p.title }))"
            :categories="categories.map((c) => ({ id: c.id, name: c.name }))"
            :groups="groups"
            :currencies="currencies"
          />
        </template>

        <template #summary>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <p class="text-sm text-muted">{{ t('promoSummaryDescription') }}</p>
            </div>

            <UAlert
              v-if="failure"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :title="t('errorTitle')"
              :description="failure"
            />

            <dl class="flex flex-col gap-4">
              <div>
                <dt class="text-xs text-dimmed">{{ t('promoSummaryWhat') }}</dt>
                <dd class="flex items-baseline gap-2">
                  <span v-if="draft.kind === 'percent'" class="text-2xl font-bold text-highlighted">−{{ draft.value || '0' }} %</span>
                  <PygMoney v-else-if="draft.kind === 'amount'" :cents="amountCents ?? 0" :currency="draft.currency" size="md" />
                  <span v-else class="text-sm font-semibold text-highlighted">
                    {{ t('promoBuygetFor') }} {{ draft.buyQuantity }} {{ t('promoBuygetBought') }}
                    {{ draft.getQuantity }} {{ t('promoBuygetFree') }}
                  </span>
                </dd>
              </div>

              <div>
                <dt class="text-xs text-dimmed">{{ t('promoSummaryWhere') }}</dt>
                <dd class="text-sm text-default">
                  {{ t(promotionTargetKey(draft.target)) }}
                  <span v-if="draft.target === 'products'">· {{ draft.productIds.length }} {{ t('promoPickedCount') }}</span>
                  <span v-else-if="draft.target === 'categories'">· {{ draft.categoryIds.length }} {{ t('promoPickedCount') }}</span>
                </dd>
              </div>

              <div>
                <dt class="text-xs text-dimmed">{{ t('promoSummaryWho') }}</dt>
                <dd class="text-sm text-default flex flex-wrap items-center gap-2">
                  <template v-if="minSubtotalCents || chosenGroups.length">
                    <span v-if="minSubtotalCents" class="flex items-center gap-1">
                      {{ t('promoMinSubtotalLabel') }}
                      <PygMoney :cents="minSubtotalCents" :currency="draft.currency" size="sm" />
                    </span>
                    <PygStatus v-for="group in chosenGroups" :key="group.id" tone="info" icon="i-lucide-users-round" :label="group.name" />
                  </template>
                  <span v-else>{{ t('promoConditionsNone') }}</span>
                </dd>
              </div>

              <div>
                <dt class="text-xs text-dimmed">{{ t('promoSummaryWhen') }}</dt>
                <dd class="text-sm text-default flex flex-wrap items-center gap-2">
                  <PygStatus
                    :tone="draft.automatic ? 'info' : 'neutral'"
                    :icon="draft.automatic ? 'i-lucide-wand-sparkles' : 'i-lucide-ticket'"
                    :label="draft.automatic ? t('promoAutomaticBadge') : (draft.code.toUpperCase() || t('promoCodeLabel'))"
                  />
                  <span v-if="draft.startsAt">{{ t('promoFrom') }} {{ draft.startsAt }}</span>
                  <span v-if="draft.endsAt">{{ t('promoUntil') }} {{ draft.endsAt }}</span>
                  <span v-else>· {{ t('promoNoDates') }}</span>
                  <span v-if="draft.budgetKind === 'spend' && budgetCents" class="flex items-center gap-1">
                    · {{ t('promoBudgetLimitLabel') }}
                    <PygMoney :cents="budgetCents" :currency="draft.currency" size="sm" />
                  </span>
                  <span v-else-if="draft.budgetKind === 'usage' && draft.budgetLimit">
                    · {{ draft.budgetLimit }} {{ t('promoUsedTimes') }}
                  </span>
                  <span v-else>· {{ t('promoNoBudget') }}</span>
                </dd>
              </div>
            </dl>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
