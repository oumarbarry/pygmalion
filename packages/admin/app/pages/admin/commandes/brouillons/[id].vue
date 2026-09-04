<script setup lang="ts">
/**
 * E2 — draft order detail: review, then turn it into a real order (stock gets
 * reserved) or drop it. « Le client a déjà payé » is the plain-language face
 * of `markPaid`: it records the money as collected offline instead of leaving
 * the order to be collected.
 */
import { orderStatusView, type OrderDetail } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const draftId = String(route.params.id)
const fetcher = useAdminApi()

// `GET /admin/draft-orders/:id` returns the bare row; the generic order read
// serves the same id WITH its lines and totals — one call, everything shown.
const { data, status, error, refresh } = useAdminFetch<{ order: OrderDetail }>(`/api/admin/orders/${draftId}`)
const draft = computed(() => data.value?.order ?? null)
const loading = computed(() => status.value === 'pending')
const isDraft = computed(() => draft.value?.status === 'draft')

const markPaid = ref(false)
const confirmConvert = ref(false)
const confirmCancel = ref(false)
const busy = ref(false)
const toast = useToast()

async function run(fn: () => Promise<unknown>) {
  if (busy.value) return false
  busy.value = true
  try {
    await fn()
    return true
  } catch {
    return false
  } finally {
    busy.value = false
  }
}

async function convert() {
  const ok = await run(() => fetcher(`/api/admin/draft-orders/${draftId}/convert-to-order`, { method: 'POST', body: { markPaid: markPaid.value } }))
  confirmConvert.value = false
  if (ok) {
    toast.add({ title: t('draftConverted'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(`/admin/commandes/${draftId}`)
  }
}

async function cancel() {
  const ok = await run(() => fetcher(`/api/admin/draft-orders/${draftId}/cancel`, { method: 'POST', body: {} }))
  confirmCancel.value = false
  if (ok) await navigateTo('/admin/commandes/brouillons')
}
</script>

<template>
  <PygPage
    :title="draft ? `${t('orderNumberPrefix')}${draft.displayId}` : t('loading')"
    :description="draft?.email ?? undefined"
    back-to="/admin/commandes/brouillons"
  >
    <div v-if="loading && !draft" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
    </div>

    <UAlert
      v-else-if="error || !draft"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="t('errorGeneric')"
    >
      <template #actions>
        <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="refresh()" />
      </template>
    </UAlert>

    <div v-else class="flex flex-col gap-6">
      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <PygStatus
            :tone="orderStatusView(draft.status).tone"
            :icon="orderStatusView(draft.status).icon"
            :label="t(orderStatusView(draft.status).key)"
          />
          <div class="text-right">
            <p class="text-xs text-dimmed uppercase">{{ t('labelTotal') }}</p>
            <PygMoney :cents="draft.total" :currency="draft.currencyCode" size="xl" />
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionItems') }}</h2>
        </template>
        <PygEmptyState v-if="!draft.items.length" icon="i-lucide-package" :title="t('noItems')" :description="t('wizDraftLinesDescription')" />
        <ul v-else class="flex flex-col divide-y divide-default">
          <li v-for="line in draft.items" :key="line.id" class="flex items-center gap-3 py-3">
            <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="size-12 rounded-xl object-cover border border-default" >
            <div v-else class="size-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted truncate">{{ line.title }}</p>
              <p class="text-sm text-muted">{{ line.quantity }} × <PygMoney :cents="line.unitPrice" :currency="draft.currencyCode" size="sm" /></p>
            </div>
            <PygMoney :cents="line.total" :currency="draft.currencyCode" size="md" />
          </li>
        </ul>
      </UCard>

      <UCard v-if="isDraft">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <UButton
              class="self-start pyg-tap-target"
              :color="markPaid ? 'primary' : 'neutral'"
              :variant="markPaid ? 'soft' : 'outline'"
              :icon="markPaid ? 'i-lucide-check-square' : 'i-lucide-square'"
              :aria-pressed="markPaid"
              :label="t('draftMarkPaid')"
              @click="markPaid = !markPaid"
            />
            <p class="text-sm text-muted">{{ t('draftMarkPaidHelp') }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton size="lg" icon="i-lucide-check" :label="t('draftConvert')" :loading="busy" @click="confirmConvert = true" />
            <UButton size="lg" color="error" variant="outline" icon="i-lucide-trash-2" :label="t('delete')" :loading="busy" @click="confirmCancel = true" />
          </div>
        </div>
      </UCard>
    </div>

    <PygConfirm
      v-model:open="confirmConvert"
      :title="t('confirmConvertDraftTitle')"
      :description="t('confirmConvertDraftBody')"
      :danger="false"
      :confirm-label="t('draftConvert')"
      :loading="busy"
      @confirm="convert"
    />

    <PygConfirm
      v-model:open="confirmCancel"
      :title="t('confirmCancelDraftTitle')"
      :description="t('confirmCancelDraftBody')"
      :loading="busy"
      @confirm="cancel"
    />
  </PygPage>
</template>
