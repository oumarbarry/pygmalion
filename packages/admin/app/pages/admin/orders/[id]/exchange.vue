<script setup lang="ts">
/**
 * The « Échange » wizard: what comes back → what goes out
 * → where it lands → summary showing the difference BOTH ways (the customer
 * still owes, or you owe a refund).
 *
 * ponytail: deliberately, replacement lines are picked from the order's own lines (the
 * common exchange: same article, another size — price and variant prefilled)
 * or typed free-hand. No catalogue browser here: `POST /admin/exchanges`
 * requires an explicit `unitPrice` and no admin endpoint returns a variant's
 * computed price. Upgrade path: an admin variant-price read, then a picker.
 */
import { returnableByLine } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const base = `/admin/orders/${orderId}`
const { order, returns, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

const { data: reasonsData } = useAdminFetch<{ returnReasons: { id: string; label: string }[] }>('/api/admin/return-reasons')
const { data: locationsData } = useAdminFetch<{ stockLocations: { id: string; name: string }[] }>('/api/admin/stock-locations')
const reasons = computed(() => reasonsData.value?.returnReasons ?? [])
const locations = computed(() => locationsData.value?.stockLocations ?? [])

interface OutboundLine { key: number; variantId: string | null; title: string; sku: string | null; priceMajor: number; quantity: number }

const stepIndex = ref(0)
const quantities = ref<Record<string, number>>({})
const reasonId = ref<string | null>(null)
const locationId = ref<string | null>(null)
const outbound = ref<OutboundLine[]>([])
let nextKey = 1

const returnable = computed(() => (order.value ? returnableByLine(order.value, returns.value) : new Map<string, number>()))
const inboundLines = computed(() => (order.value?.items ?? []).filter((l) => (returnable.value.get(l.id) ?? 0) > 0))

watch(locations, (list) => { if (!locationId.value && list.length === 1) locationId.value = list[0]!.id }, { immediate: true })

const inbound = computed(() =>
  inboundLines.value
    .map((l) => ({ line: l, quantity: Math.min(Math.max(0, Number(quantities.value[l.id] ?? 0)), returnable.value.get(l.id) ?? 0) }))
    .filter((x) => x.quantity > 0),
)

function addFromOrderLine(lineId: string) {
  const line = order.value?.items.find((l) => l.id === lineId)
  if (!line) return
  outbound.value.push({ key: nextKey++, variantId: line.variantId, title: line.title, sku: line.sku, priceMajor: line.unitPrice / 100, quantity: 1 })
}

function addFreeLine() {
  outbound.value.push({ key: nextKey++, variantId: null, title: '', sku: null, priceMajor: 0, quantity: 1 })
}

const outboundPayload = computed(() =>
  outbound.value
    .filter((l) => l.title.trim() && Number(l.quantity) > 0)
    .map((l) => ({
      variantId: l.variantId,
      title: l.title.trim(),
      sku: l.sku,
      unitPrice: Math.max(0, Math.round(Number(l.priceMajor || 0) * 100)),
      quantity: Math.max(1, Math.round(Number(l.quantity))),
    })),
)

/** Same formula as `exchanges.create`, minus the tax on the outbound lines. */
const difference = computed(() => {
  const out = outboundPayload.value.reduce((a, l) => a + l.unitPrice * l.quantity, 0)
  const back = inbound.value.reduce((a, x) => a + Math.round((x.line.total * x.quantity) / x.line.quantity), 0)
  return out - back
})

const valid = computed(() => inbound.value.length > 0 && outboundPayload.value.length > 0)

const steps = computed(() => [
  { key: 'inbound', title: t('wizInboundTitle'), description: t('wizInboundDescription') },
  { key: 'outbound', title: t('wizOutboundTitle'), description: t('wizOutboundDescription') },
  { key: 'location', title: t('wizLocationTitle'), description: t('wizLocationDescription') },
])

const toast = useToast()

async function finish() {
  if (!valid.value) return
  const body = {
    orderId,
    inbound: inbound.value.map((x) => ({ lineItemId: x.line.id, quantity: x.quantity, reasonId: reasonId.value })),
    outbound: outboundPayload.value,
    locationId: locationId.value,
  }
  const ok = await mutate(() => fetcher('/api/admin/exchanges', { method: 'POST', body }))
  if (ok) {
    toast.add({ title: t('exchangeDone'), color: 'success', icon: 'i-lucide-repeat' })
    await navigateTo(base)
  }
}
</script>

<template>
  <PygPage :title="t('exchangeWizardTitle')" :back-to="base">
    <UCard>
      <div v-if="loading && !order" class="flex flex-col gap-3" role="status" aria-live="polite">
        <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
      </div>

      <PygEmptyState
        v-else-if="!order || !inboundLines.length"
        icon="i-lucide-repeat"
        :title="t('whyNoReturn')"
        :description="t('ordersEmptyReturnsDescription')"
        :action-label="t('back')"
        :action-to="base"
      />

      <PygWizard v-else v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('actionExchange')" @finish="finish">
        <template #step-inbound>
          <div class="flex flex-col gap-4">
            <ul class="flex flex-col divide-y divide-default">
              <li v-for="line in inboundLines" :key="line.id" class="flex items-center gap-3 py-3">
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
            <div v-if="reasons.length" class="flex flex-wrap gap-2">
              <UButton
                v-for="reason in reasons"
                :key="reason.id"
                size="sm"
                :color="reasonId === reason.id ? 'primary' : 'neutral'"
                :variant="reasonId === reason.id ? 'soft' : 'outline'"
                :label="reason.label"
                class="pyg-tap-target"
                @click="reasonId = reasonId === reason.id ? null : reason.id"
              />
            </div>
          </div>
        </template>

        <template #step-outbound>
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="line in order.items"
                :key="line.id"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-plus"
                class="pyg-tap-target"
                :label="line.title"
                @click="addFromOrderLine(line.id)"
              />
              <UButton size="sm" color="primary" variant="soft" icon="i-lucide-plus" class="pyg-tap-target" :label="t('customLineAdd')" @click="addFreeLine" />
            </div>

            <p v-if="!outbound.length" class="text-sm text-muted">{{ t('noItems') }}</p>
            <div v-for="line in outbound" :key="line.key" class="flex flex-wrap items-end gap-3 rounded-xl border border-default p-3">
              <UFormField :label="t('labelTitle')" class="min-w-40 flex-1">
                <UInput v-model="line.title" size="lg" />
              </UFormField>
              <UFormField :label="t('labelPrice')" class="w-28">
                <UInput v-model.number="line.priceMajor" type="number" min="0" step="0.01" size="lg" />
              </UFormField>
              <UFormField :label="t('labelQuantity')" class="w-24">
                <UInput v-model.number="line.quantity" type="number" min="1" size="lg" />
              </UFormField>
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                class="pyg-tap-target"
                :aria-label="t('removeLine')"
                @click="outbound = outbound.filter((l) => l.key !== line.key)"
              />
            </div>
          </div>
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
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-info" :description="t('wizNoLocations')" />
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!valid" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
            <template v-else>
              <div>
                <p class="text-xs text-dimmed uppercase">{{ t('wizInboundTitle') }}</p>
                <ul class="text-sm">
                  <li v-for="x in inbound" :key="x.line.id">{{ x.quantity }} × {{ x.line.title }}</li>
                </ul>
              </div>
              <div>
                <p class="text-xs text-dimmed uppercase">{{ t('wizOutboundTitle') }}</p>
                <ul class="text-sm">
                  <li v-for="(l, index) in outboundPayload" :key="index">{{ l.quantity }} × {{ l.title }}</li>
                </ul>
              </div>
              <div class="rounded-xl bg-muted p-4">
                <p class="text-sm font-semibold text-highlighted">
                  {{ difference > 0 ? t('wizDifferenceOwed') : difference < 0 ? t('wizDifferenceRefund') : t('wizDifferenceEven') }}
                </p>
                <PygMoney v-if="difference !== 0" :cents="Math.abs(difference)" :currency="order.currencyCode" size="lg" />
                <p class="text-xs text-dimmed mt-1">{{ t('wizDifferenceEstimate') }}</p>
              </div>
            </template>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
