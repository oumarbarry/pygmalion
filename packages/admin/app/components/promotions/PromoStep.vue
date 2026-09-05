<script setup lang="ts">
/**
 * One question of the promotion flow, rendered from a single source by
 * `PygWizard` (creation, one screen at a time) and stacked on the edit page.
 * Same trick as `catalog/ProductStep.vue`: a guided wizard without
 * writing the form twice. Domain component (`Promotions` prefix), not base.
 */
import type { PromoKind, PromotionDraft } from '../../utils/promotion-form'

const props = withDefaults(defineProps<{
  step: 'type' | 'target' | 'conditions' | 'budget' | 'code'
  draft: PromotionDraft
  products: { id: string; title: string }[]
  categories: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  currencies: string[]
  /**
   * Kinds the merchant may no longer pick. Used by the edit screen: the
   * promotion's `type` (standard vs buyget) is not part of the update
   * payload the API accepts, so switching families would silently not
   * apply.
   */
  lockedKinds?: PromoKind[]
}>(), {
  lockedKinds: () => [],
})

const { t } = useVocabulary()

const kinds = computed(() => [
  { value: 'percent' as const, label: t('promoKindPercent'), hint: t('promoKindPercentHint'), icon: 'i-lucide-percent' },
  { value: 'amount' as const, label: t('promoKindAmount'), hint: t('promoKindAmountHint'), icon: 'i-lucide-banknote' },
  { value: 'buyget' as const, label: t('promoKindBuyget'), hint: t('promoKindBuygetHint'), icon: 'i-lucide-gift' },
])

const targets = computed(() => [
  { value: 'order' as const, label: t('promoTargetOrder'), hint: t('promoTargetOrderHint'), icon: 'i-lucide-shopping-cart' },
  { value: 'products' as const, label: t('promoTargetProducts'), hint: t('promoTargetProductsHint'), icon: 'i-lucide-shopping-bag' },
  { value: 'categories' as const, label: t('promoTargetCategories'), hint: t('promoTargetCategoriesHint'), icon: 'i-lucide-folder-tree' },
  { value: 'shipping' as const, label: t('promoTargetShipping'), hint: t('promoTargetShippingHint'), icon: 'i-lucide-truck' },
])

const budgets = computed(() => [
  { value: 'none' as const, label: t('promoBudgetNone'), hint: t('promoBudgetNoneHint'), icon: 'i-lucide-infinity' },
  { value: 'spend' as const, label: t('promoBudgetSpend'), hint: t('promoBudgetSpendHint'), icon: 'i-lucide-wallet' },
  { value: 'usage' as const, label: t('promoBudgetUsage'), hint: t('promoBudgetUsageHint'), icon: 'i-lucide-hash' },
])

/** Long catalogues: one filter box shared by the products and categories lists. */
const filter = ref('')
const matches = (label: string) => label.toLowerCase().includes(filter.value.trim().toLowerCase())
const visibleProducts = computed(() => props.products.filter((p) => matches(p.title)))
const visibleCategories = computed(() => props.categories.filter((c) => matches(c.name)))

function toggle(list: string[], id: string, checked: boolean) {
  const next = new Set(list)
  if (checked) next.add(id)
  else next.delete(id)
  return [...next]
}
</script>

<template>
  <!-- 1. The discount -->
  <div v-if="step === 'type'" class="flex flex-col gap-5">
    <fieldset class="flex flex-col gap-2">
      <legend class="sr-only">{{ t('promoStepType') }}</legend>
      <label
        v-for="choice in kinds"
        :key="choice.value"
        class="flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors min-h-11"
        :class="[
          draft.kind === choice.value ? 'border-primary bg-primary/5 text-primary' : 'border-default hover:bg-muted',
          lockedKinds.includes(choice.value) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ]"
      >
        <input
          v-model="draft.kind"
          type="radio"
          :value="choice.value"
          :disabled="lockedKinds.includes(choice.value)"
          class="size-4 mt-1 accent-current"
        >
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold flex items-center gap-2">
            <UIcon :name="choice.icon" class="size-4" />
            {{ choice.label }}
          </span>
          <span class="text-xs text-muted">{{ choice.hint }}</span>
        </span>
      </label>
    </fieldset>

    <p v-if="lockedKinds.length" class="text-xs text-muted">{{ t('promoKindLocked') }}</p>

    <UFormField v-if="draft.kind === 'percent'" :label="t('promoPercentLabel')" name="value" required>
      <UInput v-model="draft.value" type="number" min="1" max="100" size="md" class="w-full" inputmode="numeric" />
    </UFormField>

    <div v-else-if="draft.kind === 'amount'" class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('promoAmountLabel')" name="value" required>
        <UInput v-model="draft.value" size="md" class="w-full" inputmode="decimal" />
      </UFormField>
      <UFormField :label="t('promoCurrencyLabel')" name="currency">
        <USelect
          v-model="draft.currency"
          :items="currencies.map((c) => ({ label: c.toUpperCase(), value: c }))"
          value-key="value"
          size="md"
          class="w-full"
        />
      </UFormField>
    </div>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('promoBuyQtyLabel')" name="buyQuantity" required>
          <UInput v-model="draft.buyQuantity" type="number" min="1" size="md" class="w-full" inputmode="numeric" />
        </UFormField>
        <UFormField :label="t('promoGetQtyLabel')" name="getQuantity" required>
          <UInput v-model="draft.getQuantity" type="number" min="1" size="md" class="w-full" inputmode="numeric" />
        </UFormField>
      </div>
      <p class="text-sm font-semibold text-highlighted">
        {{ t('promoBuygetFor') }} {{ draft.buyQuantity || '2' }} {{ t('promoBuygetBought') }}
        {{ draft.getQuantity || '1' }} {{ t('promoBuygetFree') }}
      </p>
    </template>
  </div>

  <!-- 2. On what -->
  <div v-else-if="step === 'target'" class="flex flex-col gap-5">
    <fieldset class="flex flex-col gap-2">
      <legend class="sr-only">{{ t('promoStepTarget') }}</legend>
      <label
        v-for="choice in targets"
        :key="choice.value"
        class="flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors min-h-11"
        :class="draft.target === choice.value ? 'border-primary bg-primary/5 text-primary' : 'border-default hover:bg-muted'"
      >
        <input v-model="draft.target" type="radio" :value="choice.value" class="size-4 mt-1 accent-current">
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold flex items-center gap-2">
            <UIcon :name="choice.icon" class="size-4" />
            {{ choice.label }}
          </span>
          <span class="text-xs text-muted">{{ choice.hint }}</span>
        </span>
      </label>
    </fieldset>

    <template v-if="draft.target === 'products' || draft.target === 'categories'">
      <PygEmptyState
        v-if="draft.target === 'products' && !products.length"
        icon="i-lucide-package-open"
        :title="t('productsEmptyTitle')"
        :description="t('productsEmptyDescription')"
        :action-label="t('productsEmptyAction')"
        action-to="/admin/products/new"
      />
      <PygEmptyState
        v-else-if="draft.target === 'categories' && !categories.length"
        icon="i-lucide-folder-tree"
        :title="t('categoriesEmptyTitle')"
        :description="t('categoriesEmptyDescription')"
        :action-label="t('newCategory')"
        action-to="/admin/products/categories"
      />

      <template v-else>
      <UInput
        v-model="filter"
        size="md"
        icon="i-lucide-search"
        class="w-full"
        :placeholder="t('promoPickPlaceholder')"
        :aria-label="t('search')"
      />

      <fieldset class="flex flex-col gap-1 max-h-72 overflow-y-auto rounded-xl border border-default p-3">
        <legend class="text-sm font-semibold text-highlighted px-1">
          {{ draft.target === 'products' ? t('promoPickProducts') : t('promoPickCategories') }}
        </legend>
        <template v-if="draft.target === 'products'">
          <UCheckbox
            v-for="product in visibleProducts"
            :key="product.id"
            :model-value="draft.productIds.includes(product.id)"
            :label="product.title"
            class="min-h-11 items-center"
            @update:model-value="(checked) => draft.productIds = toggle(draft.productIds, product.id, checked === true)"
          />
        </template>
        <template v-else>
          <UCheckbox
            v-for="category in visibleCategories"
            :key="category.id"
            :model-value="draft.categoryIds.includes(category.id)"
            :label="category.name"
            class="min-h-11 items-center"
            @update:model-value="(checked) => draft.categoryIds = toggle(draft.categoryIds, category.id, checked === true)"
          />
        </template>
      </fieldset>

      <p class="text-xs text-dimmed">
        {{ draft.target === 'products' ? draft.productIds.length : draft.categoryIds.length }} {{ t('promoPickedCount') }}
      </p>

      <template v-if="draft.kind !== 'buyget'">
        <USwitch v-model="draft.splitAcross" :label="t('promoSplitAcross')" />
        <p class="text-xs text-muted">{{ draft.splitAcross ? t('promoSplitAcrossHint') : t('promoSplitEachHint') }}</p>
      </template>
      </template>
    </template>
  </div>

  <!-- 3. The conditions -->
  <div v-else-if="step === 'conditions'" class="flex flex-col gap-5">
    <UFormField :label="t('promoMinSubtotalLabel')" :description="t('promoMinSubtotalHint')" name="minSubtotal">
      <UInput v-model="draft.minSubtotal" size="md" class="w-full" inputmode="decimal" />
    </UFormField>

    <div v-if="groups.length" class="flex flex-col gap-2">
      <p class="text-sm font-semibold text-highlighted">{{ t('promoGroupsLabel') }}</p>
      <p class="text-xs text-muted">{{ t('promoGroupsHint') }}</p>
      <fieldset class="flex flex-col gap-1 max-h-56 overflow-y-auto rounded-xl border border-default p-3">
        <legend class="sr-only">{{ t('promoGroupsLabel') }}</legend>
        <UCheckbox
          v-for="group in groups"
          :key="group.id"
          :model-value="draft.groupIds.includes(group.id)"
          :label="group.name"
          class="min-h-11 items-center"
          @update:model-value="(checked) => draft.groupIds = toggle(draft.groupIds, group.id, checked === true)"
        />
      </fieldset>
    </div>

    <PygEmptyState
      v-else
      icon="i-lucide-users-round"
      :title="t('promoNoGroupsTitle')"
      :description="t('promoNoGroupsDescription')"
      :action-label="t('groupNew')"
      action-to="/admin/customers/groups"
    />
  </div>

  <!-- 4. The budget -->
  <div v-else-if="step === 'budget'" class="flex flex-col gap-5">
    <fieldset class="flex flex-col gap-2">
      <legend class="sr-only">{{ t('promoStepBudget') }}</legend>
      <label
        v-for="choice in budgets"
        :key="choice.value"
        class="flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors min-h-11"
        :class="draft.budgetKind === choice.value ? 'border-primary bg-primary/5 text-primary' : 'border-default hover:bg-muted'"
      >
        <input v-model="draft.budgetKind" type="radio" :value="choice.value" class="size-4 mt-1 accent-current">
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold flex items-center gap-2">
            <UIcon :name="choice.icon" class="size-4" />
            {{ choice.label }}
          </span>
          <span class="text-xs text-muted">{{ choice.hint }}</span>
        </span>
      </label>
    </fieldset>

    <UFormField v-if="draft.budgetKind === 'spend'" :label="t('promoBudgetLimitLabel')" name="budgetLimit" required>
      <UInput v-model="draft.budgetLimit" size="md" class="w-full" inputmode="decimal" />
    </UFormField>
    <UFormField v-else-if="draft.budgetKind === 'usage'" :label="t('promoBudgetCountLabel')" name="budgetLimit" required>
      <UInput v-model="draft.budgetLimit" type="number" min="1" size="md" class="w-full" inputmode="numeric" />
    </UFormField>
  </div>

  <!-- 5. Code and duration -->
  <div v-else class="flex flex-col gap-5">
    <USwitch v-model="draft.automatic" :label="t('promoAutomaticLabel')" :description="t('promoAutomaticHint')" />

    <UFormField v-if="!draft.automatic" :label="t('promoCodeLabel')" :description="t('promoCodeHint')" name="code" required>
      <UInput v-model="draft.code" size="md" class="w-full uppercase" />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('promoStartsAt')" name="startsAt">
        <UInput v-model="draft.startsAt" type="date" size="md" class="w-full" />
      </UFormField>
      <UFormField :label="t('promoEndsAt')" :description="t('promoDatesHint')" name="endsAt">
        <UInput v-model="draft.endsAt" type="date" size="md" class="w-full" />
      </UFormField>
    </div>
  </div>
</template>
