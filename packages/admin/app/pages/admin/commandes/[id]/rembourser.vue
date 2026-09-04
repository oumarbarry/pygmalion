<script setup lang="ts">
/**
 * The « Rembourser » wizard: how much (capped at what was
 * actually collected, the same cap `checkout.doRefund` enforces) → why →
 * summary. Amounts are typed in major units and converted to cents.
 */
import { refundable } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const base = `/admin/commandes/${orderId}`
const { order, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

const { data: reasonsData } = useAdminFetch<{ refundReasons: { id: string; code: string; label: string }[] }>('/api/admin/refund-reasons')
const reasons = computed(() => reasonsData.value?.refundReasons ?? [])

const stepIndex = ref(0)
const amountMajor = ref(0)
const reasonId = ref<string | null>(null)
const note = ref('')

const cap = computed(() => (order.value ? refundable(order.value) : 0))
watch(cap, (value) => { if (!amountMajor.value) amountMajor.value = value / 100 }, { immediate: true })

const cents = computed(() => Math.round(Number(amountMajor.value || 0) * 100))
const tooHigh = computed(() => cents.value > cap.value)
const valid = computed(() => cents.value > 0 && !tooHigh.value)

const steps = computed(() => [
  { key: 'amount', title: t('wizAmountTitle'), description: t('wizAmountDescription') },
  { key: 'reason', title: t('wizReasonTitle'), description: t('wizReasonDescription') },
])

const toast = useToast()

async function finish() {
  if (!valid.value) return
  const ok = await mutate(() =>
    fetcher(`/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      body: { amount: cents.value, refundReasonId: reasonId.value, note: note.value.trim() || null },
    }),
  )
  if (ok) {
    toast.add({ title: t('refundDone'), color: 'success', icon: 'i-lucide-undo-2' })
    await navigateTo(base)
  }
}
</script>

<template>
  <PygPage :title="t('refundWizardTitle')" :back-to="base">
    <UCard>
      <div v-if="loading && !order" class="flex flex-col gap-3" role="status" aria-live="polite">
        <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
      </div>

      <PygEmptyState
        v-else-if="!order || cap === 0"
        icon="i-lucide-hand-coins"
        :title="t('whyNoRefund')"
        :description="t('ordersEmptyToCollectDescription')"
        :action-label="t('back')"
        :action-to="base"
      />

      <PygWizard v-else v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('actionRefund')" @finish="finish">
        <template #step-amount>
          <div class="flex flex-col gap-4">
            <div class="rounded-xl bg-muted p-4">
              <p class="text-xs text-dimmed">{{ t('labelRefundable') }}</p>
              <PygMoney :cents="cap" :currency="order.currencyCode" size="lg" />
            </div>
            <UFormField :label="t('labelAmount')" :error="tooHigh ? t('amountTooHigh') : undefined">
              <UInput v-model.number="amountMajor" type="number" min="0" step="0.01" size="lg" :trailing="false" />
            </UFormField>
          </div>
        </template>

        <template #step-reason>
          <div class="flex flex-col gap-4">
            <div v-if="reasons.length" class="flex flex-wrap gap-2">
              <UButton
                v-for="reason in reasons"
                :key="reason.id"
                :color="reasonId === reason.id ? 'primary' : 'neutral'"
                :variant="reasonId === reason.id ? 'soft' : 'outline'"
                :label="reason.label"
                class="pyg-tap-target"
                @click="reasonId = reasonId === reason.id ? null : reason.id"
              />
            </div>
            <UAlert v-else color="neutral" variant="soft" icon="i-lucide-info" :description="t('wizNoReasons')" />
            <UFormField :label="t('labelNote')" :hint="t('labelOptional')">
              <UTextarea v-model="note" :rows="3" />
            </UFormField>
          </div>
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!valid" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('amountTooHigh')" />
            <template v-else>
              <div>
                <p class="text-xs text-dimmed uppercase">{{ t('actionRefund') }}</p>
                <PygMoney :cents="cents" :currency="order.currencyCode" size="xl" />
              </div>
              <p v-if="reasonId" class="text-sm text-muted">
                {{ t('labelReason') }} : {{ reasons.find((r) => r.id === reasonId)?.label }}
              </p>
              <p v-if="note.trim()" class="text-sm text-muted">{{ t('labelNote') }} : {{ note }}</p>
            </template>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
