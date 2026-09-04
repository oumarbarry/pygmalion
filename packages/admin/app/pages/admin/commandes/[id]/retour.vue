<script setup lang="ts">
/**
 * The « Retour » wizard: which shipped items come back →
 * why → where they land → what you plan to refund → summary. Quantities are
 * capped at shipped − already returned, the exact rule
 * `returns.insertReturnTx` validates.
 */
import { returnableByLine } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const base = `/admin/commandes/${orderId}`
const { order, returns, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

const { data: reasonsData } = useAdminFetch<{ returnReasons: { id: string; label: string }[] }>('/api/admin/return-reasons')
const { data: locationsData } = useAdminFetch<{ stockLocations: { id: string; name: string }[] }>('/api/admin/stock-locations')
const reasons = computed(() => reasonsData.value?.returnReasons ?? [])
const locations = computed(() => locationsData.value?.stockLocations ?? [])

const stepIndex = ref(0)
const quantities = ref<Record<string, number>>({})
const reasonId = ref<string | null>(null)
const locationId = ref<string | null>(null)
const refundMajor = ref(0)

const returnable = computed(() => (order.value ? returnableByLine(order.value, returns.value) : new Map<string, number>()))
const lines = computed(() => (order.value?.items ?? []).filter((l) => (returnable.value.get(l.id) ?? 0) > 0))

watch(locations, (list) => { if (!locationId.value && list.length === 1) locationId.value = list[0]!.id }, { immediate: true })

const picked = computed(() =>
  lines.value
    .map((l) => ({ line: l, quantity: Math.min(Math.max(0, Number(quantities.value[l.id] ?? 0)), returnable.value.get(l.id) ?? 0) }))
    .filter((x) => x.quantity > 0),
)

const refundCents = computed(() => Math.round(Number(refundMajor.value || 0) * 100))

const steps = computed(() => [
  { key: 'lines', title: t('wizReturnLinesTitle'), description: t('wizReturnLinesDescription') },
  { key: 'reason', title: t('wizReasonTitle'), description: t('wizReasonDescription') },
  { key: 'location', title: t('wizLocationTitle'), description: t('wizLocationDescription') },
  { key: 'refund', title: t('wizRefundIntentTitle'), description: t('wizRefundIntentDescription') },
])

const toast = useToast()

async function finish() {
  if (!picked.value.length) return
  const ok = await mutate(() =>
    fetcher('/api/admin/returns', {
      method: 'POST',
      body: {
        orderId,
        items: picked.value.map((p) => ({ lineItemId: p.line.id, quantity: p.quantity, reasonId: reasonId.value })),
        locationId: locationId.value,
        refundAmount: refundCents.value > 0 ? refundCents.value : null,
      },
    }),
  )
  if (ok) {
    toast.add({ title: t('returnDone'), color: 'success', icon: 'i-lucide-rotate-ccw' })
    await navigateTo(base)
  }
}
</script>

<template>
  <PygPage :title="t('returnWizardTitle')" :back-to="base">
    <UCard>
      <div v-if="loading && !order" class="flex flex-col gap-3" role="status" aria-live="polite">
        <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
      </div>

      <PygEmptyState
        v-else-if="!order || !lines.length"
        icon="i-lucide-rotate-ccw"
        :title="t('whyNoReturn')"
        :description="t('ordersEmptyReturnsDescription')"
        :action-label="t('back')"
        :action-to="base"
      />

      <PygWizard v-else v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('actionReturn')" @finish="finish">
        <template #step-lines>
          <ul class="flex flex-col divide-y divide-default">
            <li v-for="line in lines" :key="line.id" class="flex items-center gap-3 py-3">
              <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="size-12 rounded-xl object-cover border border-default" >
              <div v-else class="size-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-highlighted truncate">{{ line.title }}</p>
                <p class="text-xs text-dimmed">{{ t('labelMax') }} : {{ returnable.get(line.id) }}</p>
              </div>
              <UInput
                v-model.number="quantities[line.id]"
                type="number"
                min="0"
                :max="returnable.get(line.id)"
                size="lg"
                class="w-24"
                :aria-label="`${t('labelQuantity')} — ${line.title}`"
              />
            </li>
          </ul>
        </template>

        <template #step-reason>
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
        </template>

        <template #step-location>
          <div v-if="locations.length" class="flex flex-wrap gap-2">
            <UButton
              v-for="location in locations"
              :key="location.id"
              :color="locationId === location.id ? 'primary' : 'neutral'"
              :variant="locationId === location.id ? 'soft' : 'outline'"
              :label="location.name"
              icon="i-lucide-warehouse"
              class="pyg-tap-target"
              @click="locationId = location.id"
            />
          </div>
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-triangle-alert" :description="t('wizNoLocations')" />
        </template>

        <template #step-refund>
          <UFormField :label="t('labelAmount')" :hint="t('labelOptional')">
            <UInput v-model.number="refundMajor" type="number" min="0" step="0.01" size="lg" />
          </UFormField>
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!picked.length" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
            <template v-else>
              <ul class="flex flex-col gap-2">
                <li v-for="p in picked" :key="p.line.id" class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-highlighted truncate">{{ p.line.title }}</span>
                  <span class="font-bold">× {{ p.quantity }}</span>
                </li>
              </ul>
              <p v-if="reasonId" class="text-sm text-muted">{{ t('labelReason') }} : {{ reasons.find((r) => r.id === reasonId)?.label }}</p>
              <p v-if="locationId" class="text-sm text-muted">{{ t('labelLocation') }} : {{ locations.find((l) => l.id === locationId)?.name }}</p>
              <div v-if="refundCents > 0">
                <p class="text-xs text-dimmed uppercase">{{ t('wizRefundIntentTitle') }}</p>
                <PygMoney :cents="refundCents" :currency="order.currencyCode" size="lg" />
              </div>
            </template>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
