<script setup lang="ts">
/**
 * The « Réclamation » wizard: what you do for the customer
 * (send again / refund) → which items and what went wrong → photos →
 * replacement lines or refund amount → summary.
 *
 * Deliberately no inbound-return leg here (the API allows one). A claim is
 * "something went wrong", not "send it back"; a merchant who wants the goods
 * back records a return from the order. Add the leg when a real flow needs
 * both in one shot.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const base = `/admin/orders/${orderId}`
const { order, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

interface OutboundLine { key: number; variantId: string | null; title: string; sku: string | null; priceMajor: number; quantity: number }

const REASONS = [
  { value: 'missing_item', key: 'claimReasonMissing' },
  { value: 'wrong_item', key: 'claimReasonWrong' },
  { value: 'production_failure', key: 'claimReasonBroken' },
  { value: 'other', key: 'claimReasonOther' },
] as const

const stepIndex = ref(0)
const type = ref<'replace' | 'refund'>('replace')
const quantities = ref<Record<string, number>>({})
const lineReason = ref<Record<string, string>>({})
const note = ref('')
const images = ref<string[]>([])
const uploading = ref(false)
const outbound = ref<OutboundLine[]>([])
const refundMajor = ref(0)
let nextKey = 1

const picked = computed(() =>
  (order.value?.items ?? [])
    .map((line) => ({ line, quantity: Math.min(Math.max(0, Number(quantities.value[line.id] ?? 0)), line.quantity) }))
    .filter((x) => x.quantity > 0),
)

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

const refundCents = computed(() => Math.round(Number(refundMajor.value || 0) * 100))
const valid = computed(() => picked.value.length > 0 && (type.value === 'refund' || outboundPayload.value.length > 0))

function addFromOrderLine(lineId: string) {
  const line = order.value?.items.find((l) => l.id === lineId)
  if (!line) return
  outbound.value.push({ key: nextKey++, variantId: line.variantId, title: line.title, sku: line.sku, priceMajor: line.unitPrice / 100, quantity: 1 })
}

async function uploadPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (!files.length) return
  uploading.value = true
  try {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    const res = await fetcher<{ files: { url: string }[] }>('/api/admin/uploads', { method: 'POST', body: form })
    images.value = [...images.value, ...res.files.map((f) => f.url)]
  } catch {
    // $adminFetch already surfaced the reason.
  } finally {
    uploading.value = false
    input.value = ''
  }
}

const steps = computed(() => [
  { key: 'type', title: t('wizClaimTypeTitle'), description: t('wizClaimTypeDescription') },
  { key: 'items', title: t('wizClaimItemsTitle'), description: t('wizClaimItemsDescription') },
  { key: 'photos', title: t('wizPhotosTitle'), description: t('wizPhotosDescription') },
  type.value === 'replace'
    ? { key: 'outbound', title: t('wizReplacementTitle'), description: t('wizReplacementDescription') }
    : { key: 'refund', title: t('claimRefundAmountTitle'), description: t('wizAmountDescription') },
])

const toast = useToast()

async function finish() {
  if (!valid.value) return
  const ok = await mutate(() =>
    fetcher('/api/admin/claims', {
      method: 'POST',
      body: {
        orderId,
        type: type.value,
        items: picked.value.map((p) => ({
          lineItemId: p.line.id,
          quantity: p.quantity,
          reason: lineReason.value[p.line.id] ?? 'other',
          images: images.value.length ? images.value : null,
          note: note.value.trim() || null,
        })),
        outbound: type.value === 'replace' ? outboundPayload.value : undefined,
        refundAmount: type.value === 'refund' && refundCents.value > 0 ? refundCents.value : null,
      },
    }),
  )
  if (ok) {
    toast.add({ title: t('claimDone'), color: 'success', icon: 'i-lucide-message-square-warning' })
    await navigateTo(base)
  }
}
</script>

<template>
  <PygPage :title="t('claimWizardTitle')" :back-to="base">
    <UCard>
      <div v-if="loading && !order" class="flex flex-col gap-3" role="status" aria-live="polite">
        <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
      </div>

      <PygEmptyState
        v-else-if="!order || !order.items.length"
        icon="i-lucide-message-square-warning"
        :title="t('noItems')"
        :description="t('ordersEmptyAllDescription')"
        :action-label="t('back')"
        :action-to="base"
      />

      <PygWizard v-else v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('actionClaim')" @finish="finish">
        <template #step-type>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UButton
              size="xl"
              icon="i-lucide-package"
              :color="type === 'replace' ? 'primary' : 'neutral'"
              :variant="type === 'replace' ? 'soft' : 'outline'"
              :label="t('claimTypeReplace')"
              @click="type = 'replace'"
            />
            <UButton
              size="xl"
              icon="i-lucide-undo-2"
              :color="type === 'refund' ? 'primary' : 'neutral'"
              :variant="type === 'refund' ? 'soft' : 'outline'"
              :label="t('claimTypeRefund')"
              @click="type = 'refund'"
            />
          </div>
        </template>

        <template #step-items>
          <div class="flex flex-col gap-4">
            <ul class="flex flex-col divide-y divide-default">
              <li v-for="line in order.items" :key="line.id" class="flex flex-col gap-2 py-3">
                <div class="flex items-center gap-3">
                  <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="size-12 rounded-xl object-cover border border-default" >
                  <div v-else class="size-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-highlighted truncate">{{ line.title }}</p>
                    <p class="text-xs text-dimmed">{{ t('labelMax') }} : {{ line.quantity }}</p>
                  </div>
                  <UInput
                    v-model.number="quantities[line.id]"
                    type="number"
                    min="0"
                    :max="line.quantity"
                    size="lg"
                    class="w-24"
                    :aria-label="`${t('labelQuantity')} — ${line.title}`"
                  />
                </div>
                <div v-if="(quantities[line.id] ?? 0) > 0" class="flex flex-wrap gap-2">
                  <UButton
                    v-for="reason in REASONS"
                    :key="reason.value"
                    size="sm"
                    class="pyg-tap-target"
                    :color="(lineReason[line.id] ?? 'other') === reason.value ? 'primary' : 'neutral'"
                    :variant="(lineReason[line.id] ?? 'other') === reason.value ? 'soft' : 'outline'"
                    :label="t(reason.key)"
                    @click="lineReason[line.id] = reason.value"
                  />
                </div>
              </li>
            </ul>
            <UFormField :label="t('labelNote')" :hint="t('labelOptional')">
              <UTextarea v-model="note" :rows="3" />
            </UFormField>
          </div>
        </template>

        <template #step-photos>
          <div class="flex flex-col gap-3">
            <UFormField :label="t('photoAdd')" :hint="t('labelOptional')">
              <UInput type="file" accept="image/*" multiple size="lg" :disabled="uploading" @change="uploadPhotos" />
            </UFormField>
            <p v-if="uploading" class="text-sm text-muted">{{ t('photoUploading') }}</p>
            <div v-if="images.length" class="flex flex-wrap gap-2">
              <img v-for="src in images" :key="src" :src="src" alt="" class="size-20 rounded-xl object-cover border border-default" >
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

        <template #step-refund>
          <UFormField :label="t('labelAmount')" :hint="t('labelOptional')">
            <UInput v-model.number="refundMajor" type="number" min="0" step="0.01" size="lg" />
          </UFormField>
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!valid" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
            <template v-else>
              <p class="text-sm font-semibold text-highlighted">{{ type === 'refund' ? t('claimTypeRefund') : t('claimTypeReplace') }}</p>
              <ul class="text-sm">
                <li v-for="p in picked" :key="p.line.id">{{ p.quantity }} × {{ p.line.title }}</li>
              </ul>
              <ul v-if="type === 'replace'" class="text-sm text-muted">
                <li v-for="(l, index) in outboundPayload" :key="index">{{ l.quantity }} × {{ l.title }}</li>
              </ul>
              <div v-if="type === 'refund' && refundCents > 0">
                <p class="text-xs text-dimmed uppercase">{{ t('claimRefundAmountTitle') }}</p>
                <PygMoney :cents="refundCents" :currency="order.currencyCode" size="lg" />
              </div>
              <p v-if="images.length" class="text-sm text-muted">{{ t('wizPhotosTitle') }} : {{ images.length }}</p>
            </template>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
