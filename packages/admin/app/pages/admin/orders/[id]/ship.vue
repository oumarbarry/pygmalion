<script setup lang="ts">
/**
 * The « Expédier » wizard: what goes in the parcel →
 * tracking → summary. One merchant intent = two API calls (create the
 * fulfillment, then register the shipment) so the order lands on "shipped"
 * without the merchant knowing those are two steps.
 */
import { remainingToFulfill } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const base = `/admin/orders/${orderId}`
const { order, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

const stepIndex = ref(0)
const quantities = ref<Record<string, number>>({})
const trackingNumber = ref('')

const remaining = computed(() => (order.value ? remainingToFulfill(order.value) : new Map<string, number>()))
const shippableLines = computed(() => (order.value?.items ?? []).filter((l) => (remaining.value.get(l.id) ?? 0) > 0))

// Pre-fill with everything that is left — the common case is "ship it all".
watch(shippableLines, (lines) => {
  if (Object.keys(quantities.value).length || !lines.length) return
  quantities.value = Object.fromEntries(lines.map((l) => [l.id, remaining.value.get(l.id) ?? 0]))
}, { immediate: true })

const picked = computed(() =>
  shippableLines.value
    .map((l) => ({ line: l, quantity: Math.min(Math.max(0, Number(quantities.value[l.id] ?? 0)), remaining.value.get(l.id) ?? 0) }))
    .filter((x) => x.quantity > 0),
)

const steps = computed(() => [
  { key: 'lines', title: t('wizShipLinesTitle'), description: t('wizShipLinesDescription') },
  { key: 'tracking', title: t('wizTrackingTitle'), description: t('wizTrackingDescription') },
])

const toast = useToast()

async function finish() {
  if (!picked.value.length) return
  const ok = await mutate(async () => {
    const { fulfillment } = await fetcher<{ fulfillment: { id: string } }>(`/api/admin/orders/${orderId}/fulfillments`, {
      method: 'POST',
      body: { items: picked.value.map((p) => ({ lineItemId: p.line.id, quantity: p.quantity })) },
    })
    await fetcher(`/api/admin/orders/${orderId}/fulfillments/${fulfillment.id}/shipments`, {
      method: 'POST',
      body: trackingNumber.value.trim() ? { trackingNumber: trackingNumber.value.trim() } : {},
    })
  })
  if (ok) {
    toast.add({ title: t('shipDone'), color: 'success', icon: 'i-lucide-truck' })
    await navigateTo(base)
  }
}
</script>

<template>
  <PygPage :title="t('shipWizardTitle')" :back-to="base">
    <UCard>
      <div v-if="loading && !order" class="flex flex-col gap-3" role="status" aria-live="polite">
        <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
      </div>

      <PygEmptyState
        v-else-if="!order || !shippableLines.length"
        icon="i-lucide-package-check"
        :title="t('whyNoShip')"
        :description="t('ordersEmptyToShipDescription')"
        :action-label="t('back')"
        :action-to="base"
      />

      <PygWizard v-else v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('actionShip')" @finish="finish">
        <template #step-lines>
          <ul class="flex flex-col divide-y divide-default">
            <li v-for="line in shippableLines" :key="line.id" class="flex items-center gap-3 py-3">
              <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="size-12 rounded-xl object-cover border border-default" >
              <div v-else class="size-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-highlighted truncate">{{ line.title }}</p>
                <p class="text-xs text-dimmed">{{ t('labelMax') }} : {{ remaining.get(line.id) }}</p>
              </div>
              <UInput
                v-model.number="quantities[line.id]"
                type="number"
                min="0"
                :max="remaining.get(line.id)"
                size="lg"
                class="w-24"
                :aria-label="`${t('labelQuantity')} — ${line.title}`"
              />
            </li>
          </ul>
        </template>

        <template #step-tracking>
          <UFormField :label="t('labelTracking')" :hint="t('labelOptional')">
            <UInput v-model="trackingNumber" size="lg" icon="i-lucide-barcode" />
          </UFormField>
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!picked.length" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
            <ul v-else class="flex flex-col gap-2">
              <li v-for="p in picked" :key="p.line.id" class="flex items-center justify-between gap-3 text-sm">
                <span class="text-highlighted truncate">{{ p.line.title }}</span>
                <span class="font-bold">× {{ p.quantity }}</span>
              </li>
            </ul>
            <p v-if="trackingNumber.trim()" class="text-sm text-muted">{{ t('labelTracking') }} : {{ trackingNumber }}</p>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
