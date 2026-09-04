<script setup lang="ts">
/**
 * The « Modifier la commande » wizard:
 * changes → additions → PREVIEW (before/after totals, computed in memory
 * server-side, ZERO writes) → confirm. Leaving the preview cancels the
 * pending edit so the order never keeps a half-open one.
 *
 * Only lines with no prepared units can be touched — the same rule
 * `order-edits.request` enforces.
 */
import { editableLines } from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const base = `/admin/commandes/${orderId}`
const { order, loading, busy, mutate, fetcher } = useOrderDetail(orderId)

interface Addition { key: number; title: string; priceMajor: number; quantity: number }
interface Preview { itemsSubtotal: number; discountTotal: number; taxTotal: number; shippingTotal: number; total: number }

const stepIndex = ref(0)
const quantities = ref<Record<string, number>>({})
const additions = ref<Addition[]>([])
const editId = ref<string | null>(null)
const preview = ref<Preview | null>(null)
const previewFailed = ref(false)
let nextKey = 1

const lines = computed(() => (order.value ? editableLines(order.value) : []))

watch(lines, (list) => {
  if (Object.keys(quantities.value).length || !list.length) return
  quantities.value = Object.fromEntries(list.map((l) => [l.id, l.quantity]))
}, { immediate: true })

const changes = computed(() => {
  const updates: { lineItemId: string; quantity: number }[] = []
  const removals: string[] = []
  for (const line of lines.value) {
    const next = Math.max(0, Math.round(Number(quantities.value[line.id] ?? line.quantity)))
    if (next === 0) removals.push(line.id)
    else if (next !== line.quantity) updates.push({ lineItemId: line.id, quantity: next })
  }
  const adds = additions.value
    .filter((a) => a.title.trim() && Number(a.quantity) > 0)
    .map((a) => ({ variantId: null, title: a.title.trim(), sku: null, unitPrice: Math.max(0, Math.round(Number(a.priceMajor || 0) * 100)), quantity: Math.max(1, Math.round(Number(a.quantity))) }))
  return { updates, removals, additions: adds }
})

const hasChanges = computed(() => changes.value.updates.length + changes.value.removals.length + changes.value.additions.length > 0)

const steps = computed(() => [
  { key: 'lines', title: t('wizEditLinesTitle'), description: t('wizEditLinesDescription') },
  { key: 'add', title: t('wizEditAddTitle'), description: t('wizEditAddDescription') },
])

async function discardEdit() {
  const id = editId.value
  editId.value = null
  preview.value = null
  if (!id) return
  try {
    await fetcher(`/api/admin/orders/${orderId}/edits/${id}/cancel`, { method: 'POST', body: {} })
  } catch {
    // Nothing the merchant can do about it; the edit stays 'requested' server-side.
  }
}

async function openPreview() {
  if (!hasChanges.value || editId.value) return
  previewFailed.value = false
  await mutate(async () => {
    const { orderEdit } = await fetcher<{ orderEdit: { id: string } }>(`/api/admin/orders/${orderId}/edits`, { method: 'POST', body: changes.value })
    editId.value = orderEdit.id
    const res = await fetcher<{ preview: Preview }>(`/api/admin/orders/${orderId}/edits/${orderEdit.id}/preview`)
    preview.value = res.preview
  })
  if (!preview.value) previewFailed.value = true
}

watch(stepIndex, async (index, previous) => {
  if (index === steps.value.length) await openPreview()
  else if (previous === steps.value.length) await discardEdit()
})

onBeforeRouteLeave(async () => {
  if (editId.value) await discardEdit()
})

const toast = useToast()

async function finish() {
  if (!editId.value) return
  const id = editId.value
  const ok = await mutate(() => fetcher(`/api/admin/orders/${orderId}/edits/${id}/confirm`, { method: 'POST', body: {} }))
  if (ok) {
    editId.value = null
    toast.add({ title: t('editDone'), color: 'success', icon: 'i-lucide-pencil' })
    await navigateTo(base)
  }
}

const difference = computed(() => (preview.value && order.value ? preview.value.total - order.value.total : 0))
</script>

<template>
  <PygPage :title="t('editWizardTitle')" :back-to="base">
    <UCard>
      <div v-if="loading && !order" class="flex flex-col gap-3" role="status" aria-live="polite">
        <USkeleton class="h-40 w-full rounded-2xl bg-muted" />
      </div>

      <PygEmptyState
        v-else-if="!order || !lines.length"
        icon="i-lucide-pencil-off"
        :title="t('whyNoShip')"
        :description="t('wizEditLinesDescription')"
        :action-label="t('back')"
        :action-to="base"
      />

      <PygWizard v-else v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('actionEditOrder')" @finish="finish">
        <template #step-lines>
          <ul class="flex flex-col divide-y divide-default">
            <li v-for="line in lines" :key="line.id" class="flex items-center gap-3 py-3">
              <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="size-12 rounded-xl object-cover border border-default" >
              <div v-else class="size-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-highlighted truncate">{{ line.title }}</p>
                <p class="text-xs text-dimmed"><PygMoney :cents="line.unitPrice" :currency="order.currencyCode" size="sm" /></p>
              </div>
              <UInput
                v-model.number="quantities[line.id]"
                type="number"
                min="0"
                size="lg"
                class="w-24"
                :aria-label="`${t('labelQuantity')} — ${line.title}`"
              />
            </li>
          </ul>
        </template>

        <template #step-add>
          <div class="flex flex-col gap-4">
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              class="pyg-tap-target"
              :label="t('addLine')"
              @click="additions.push({ key: nextKey++, title: '', priceMajor: 0, quantity: 1 })"
            />
            <p v-if="!additions.length" class="text-sm text-muted">{{ t('noItems') }}</p>
            <div v-for="line in additions" :key="line.key" class="flex flex-wrap items-end gap-3 rounded-xl border border-default p-3">
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
                @click="additions = additions.filter((l) => l.key !== line.key)"
              />
            </div>
          </div>
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!hasChanges" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
            <UAlert
              v-else-if="previewFailed"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :title="t('errorTitle')"
              :description="t('errorGeneric')"
            />
            <div v-else-if="!preview" role="status" aria-live="polite">
              <USkeleton class="h-24 w-full rounded-2xl bg-muted" />
            </div>
            <template v-else>
              <p class="text-sm text-muted">{{ t('wizPreviewDescription') }}</p>
              <div class="grid grid-cols-2 gap-4">
                <div class="rounded-xl bg-muted p-4">
                  <p class="text-xs text-dimmed uppercase">{{ t('previewBefore') }}</p>
                  <PygMoney :cents="order.total" :currency="order.currencyCode" size="lg" />
                </div>
                <div class="rounded-xl bg-primary/10 p-4">
                  <p class="text-xs text-dimmed uppercase">{{ t('previewAfter') }}</p>
                  <PygMoney :cents="preview.total" :currency="order.currencyCode" size="lg" />
                </div>
              </div>
              <div>
                <p class="text-xs text-dimmed uppercase">{{ t('previewDifference') }}</p>
                <PygMoney :cents="difference" :currency="order.currencyCode" size="md" />
              </div>
              <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt class="text-muted">{{ t('labelSubtotal') }}</dt>
                <dd class="text-right"><PygMoney :cents="preview.itemsSubtotal" :currency="order.currencyCode" size="sm" /></dd>
                <dt class="text-muted">{{ t('labelTax') }}</dt>
                <dd class="text-right"><PygMoney :cents="preview.taxTotal" :currency="order.currencyCode" size="sm" /></dd>
                <dt class="text-muted">{{ t('labelShippingCost') }}</dt>
                <dd class="text-right"><PygMoney :cents="preview.shippingTotal" :currency="order.currencyCode" size="sm" /></dd>
              </dl>
            </template>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
