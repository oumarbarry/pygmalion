<script setup lang="ts">
/**
 * E2 — return detail + partial receipt. One question ("how many units came
 * back, and how many are damaged?"), so a form rather than a wizard.
 * Receiving re-increments resellable stock server-side; damaged units do not
 * go back on the shelf, which is why they are asked for here.
 */
import { receivableByLine, returnAbilities, returnStatusView } from '../../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const returnId = String(route.params.returnId)
const base = `/admin/commandes/${orderId}`
const { order, returns, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

const ret = computed(() => returns.value.find((r) => r.id === returnId) ?? null)
const abilities = computed(() => (ret.value ? returnAbilities(ret.value) : null))
const receivable = computed(() => (ret.value ? receivableByLine(ret.value) : new Map<string, number>()))
const lineTitle = (lineItemId: string) => order.value?.items.find((l) => l.id === lineItemId)?.title ?? lineItemId

const received = ref<Record<string, number>>({})
const damaged = ref<Record<string, number>>({})
const confirmCancel = ref(false)

// Pre-fill with everything still expected — receiving the whole parcel is the norm.
watch(receivable, (map) => {
  if (Object.keys(received.value).length) return
  received.value = Object.fromEntries([...map.entries()].map(([id, qty]) => [id, qty]))
}, { immediate: true })

const picked = computed(() =>
  [...receivable.value.entries()]
    .map(([lineItemId, max]) => ({
      lineItemId,
      receivedQuantity: Math.min(Math.max(0, Number(received.value[lineItemId] ?? 0)), max),
      damagedQuantity: Math.max(0, Number(damaged.value[lineItemId] ?? 0)),
    }))
    .filter((x) => x.receivedQuantity > 0)
    .map((x) => ({ ...x, damagedQuantity: Math.min(x.damagedQuantity, x.receivedQuantity) })),
)

const toast = useToast()
const { formatDateTime } = useAdminFormat()

// An opaque `ret_8obF8q…` in the H1 is worse than jargon.
// The merchant identifies a return by when it was asked for.
const pageTitle = computed(() =>
  ret.value ? `${t('returnTitlePrefix')}${formatDateTime(ret.value.requestedAt ?? ret.value.createdAt)}` : t('returnTitlePrefix').trim(),
)

async function receive() {
  if (!picked.value.length) return
  const ok = await mutate(() => fetcher(`/api/admin/returns/${returnId}/receive`, { method: 'POST', body: { items: picked.value } }))
  if (ok) {
    received.value = {}
    damaged.value = {}
    toast.add({ title: t('returnDone'), color: 'success', icon: 'i-lucide-package-check' })
  }
}

async function cancel() {
  const ok = await mutate(() => fetcher(`/api/admin/returns/${returnId}/cancel`, { method: 'POST', body: {} }))
  confirmCancel.value = false
  if (ok) await navigateTo(base)
}
</script>

<template>
  <PygPage :title="pageTitle" :back-to="base">
    <template v-if="ret" #actions>
      <UButton
        v-if="abilities?.canCancel"
        color="error"
        variant="outline"
        icon="i-lucide-circle-x"
        :label="t('actionCancelReturn')"
        @click="confirmCancel = true"
      />
    </template>

    <div v-if="loading && !ret" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
    </div>

    <UAlert
      v-else-if="!ret || !order"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="t('errorGeneric')"
    />

    <div v-else class="flex flex-col gap-6">
      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <PygStatus
            :tone="returnStatusView(ret.status).tone"
            :icon="returnStatusView(ret.status).icon"
            :label="t(returnStatusView(ret.status).key)"
          />
          <div v-if="ret.refundAmount" class="text-right">
            <p class="text-xs text-dimmed uppercase">{{ t('wizRefundIntentTitle') }}</p>
            <PygMoney :cents="ret.refundAmount" :currency="order.currencyCode" size="lg" />
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionItems') }}</h2>
        </template>

        <ul class="flex flex-col divide-y divide-default">
          <li v-for="item in ret.items ?? []" :key="item.id" class="flex flex-wrap items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted truncate">{{ lineTitle(item.lineItemId) }}</p>
              <p class="text-xs text-dimmed">
                {{ t('labelRequestedQty') }} : {{ item.requestedQuantity }} · {{ t('labelReceivedQty') }} : {{ item.receivedQuantity }}
                <template v-if="item.damagedQuantity"> · {{ t('labelDamaged') }} : {{ item.damagedQuantity }}</template>
              </p>
            </div>
          </li>
        </ul>
      </UCard>

      <UCard v-if="abilities?.canReceive">
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('actionReceiveReturn') }}</h2>
        </template>

        <PygForm
          :state="{}"
          :loading="busy"
          :submit-label="t('actionReceiveReturn')"
          :cancel-label="t('back')"
          @submit="receive"
          @cancel="navigateTo(base)"
        >
          <ul class="flex flex-col divide-y divide-default">
            <li v-for="[lineItemId, max] in receivable" :key="lineItemId" class="flex flex-wrap items-end gap-3 py-3">
              <p class="min-w-0 flex-1 font-semibold text-highlighted truncate">{{ lineTitle(lineItemId) }}</p>
              <UFormField :label="t('labelReceivedQty')" class="w-28">
                <UInput
                  v-model.number="received[lineItemId]"
                  type="number"
                  min="0"
                  :max="max"
                  size="lg"
                  :aria-label="`${t('labelReceivedQty')} — ${lineTitle(lineItemId)}`"
                />
              </UFormField>
              <UFormField :label="t('labelDamaged')" class="w-28">
                <UInput
                  v-model.number="damaged[lineItemId]"
                  type="number"
                  min="0"
                  :max="received[lineItemId] ?? 0"
                  size="lg"
                  :aria-label="`${t('labelDamaged')} — ${lineTitle(lineItemId)}`"
                />
              </UFormField>
            </li>
          </ul>
          <UAlert v-if="!picked.length" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
        </PygForm>
      </UCard>
    </div>

    <PygConfirm
      v-model:open="confirmCancel"
      :title="t('confirmCancelReturnTitle')"
      :description="t('confirmCancelReturnBody')"
      :loading="busy"
      @confirm="cancel"
    />
  </PygPage>
</template>
