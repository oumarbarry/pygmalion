<script setup lang="ts">
/**
 * E2 — order detail. Every action here is driven by the real state
 * (`utils/order-status.ts`): a transition the server would refuse is not
 * rendered at all, and the two refusals a merchant can act on (cancel with
 * live shipments / with captured funds) are spelled out in plain language.
 *
 * The activity feed is derived from what the API exposes
 * (ledger + shipments + RMA rows): `order_events`, which carries the
 * before/after amounts, has no read endpoint. Upgrade path: GET /admin/orders/:id/events,
 * then `history` reads it instead of re-deriving.
 */
import {
  capturable,
  collectionCanBeMarkedPaid,
  fulfillmentAbilities,
  fulfillmentRowStatus,
  fulfillmentStatusView,
  leftToCollect,
  nextStep,
  orderAbilities,
  paymentStatusView,
  returnAbilities,
  returnStatusView,
  rmaAbilities,
  rmaStatusView,
  type OrderFulfillment,
} from '../../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const route = useRoute()
const orderId = String(route.params.id)
const { order, returns, exchanges, claims, loading, error, busy, mutate, fetcher } = useOrderDetail(orderId)

const abilities = computed(() => (order.value ? orderAbilities(order.value, returns.value) : null))
const step = computed(() => (order.value ? nextStep(order.value, returns.value) : null))
const openReturn = computed(() => returns.value.find((r) => r.status === 'requested' || r.status === 'partially_received') ?? null)
const inboundOf = (id: string, kind: 'exchange' | 'claim') =>
  returns.value.find((r) => (kind === 'exchange' ? r.exchangeId : r.claimId) === id) ?? null

const base = `/admin/commandes/${orderId}`

// --- Confirmations (consequence in plain language)----------------------------

type ConfirmKind = 'capture' | 'cancel' | 'archive' | 'unarchive' | 'markPaid' | 'collect' | 'deliver' | 'cancelShipment' | 'cancelReturn' | 'completeExchange' | 'cancelExchange' | 'completeClaim' | 'cancelClaim'
const confirmKind = ref<ConfirmKind | null>(null)
const confirmTarget = ref<string | null>(null)

function ask(kind: ConfirmKind, target: string | null = null) {
  confirmKind.value = kind
  confirmTarget.value = target
}

const CONFIRM_COPY: Record<ConfirmKind, { title: () => string; body: () => string; danger: boolean }> = {
  capture: { title: () => t('confirmCaptureTitle'), body: () => t('confirmCaptureBody'), danger: false },
  cancel: { title: () => t('confirmCancelOrderTitle'), body: () => t('confirmCancelOrderBody'), danger: true },
  archive: { title: () => t('confirmArchiveTitle'), body: () => t('confirmArchiveBody'), danger: false },
  unarchive: { title: () => t('confirmUnarchiveTitle'), body: () => t('confirmUnarchiveBody'), danger: false },
  markPaid: { title: () => t('confirmMarkAsPaidTitle'), body: () => t('confirmMarkAsPaidBody'), danger: false },
  collect: { title: () => t('confirmCreateCollectionTitle'), body: () => t('confirmCreateCollectionBody'), danger: false },
  deliver: { title: () => t('confirmDeliveredTitle'), body: () => t('confirmDeliveredBody'), danger: false },
  cancelShipment: { title: () => t('confirmCancelShipmentTitle'), body: () => t('confirmCancelShipmentBody'), danger: true },
  cancelReturn: { title: () => t('confirmCancelReturnTitle'), body: () => t('confirmCancelReturnBody'), danger: true },
  completeExchange: { title: () => t('confirmCompleteExchangeTitle'), body: () => t('confirmCompleteExchangeBody'), danger: false },
  cancelExchange: { title: () => t('confirmCancelExchangeTitle'), body: () => t('confirmCancelExchangeBody'), danger: true },
  completeClaim: { title: () => t('confirmCompleteClaimTitle'), body: () => t('confirmCompleteClaimBody'), danger: false },
  cancelClaim: { title: () => t('confirmCancelClaimTitle'), body: () => t('confirmCancelClaimBody'), danger: true },
}

const post = (url: string, body?: Record<string, unknown>) => () => fetcher(url, { method: 'POST', body: body ?? {} })

const CONFIRM_CALL: Record<ConfirmKind, (target: string | null) => () => Promise<unknown>> = {
  capture: () => post(`/api/admin/orders/${orderId}/capture`),
  cancel: () => post(`/api/admin/orders/${orderId}/cancel`),
  archive: () => post(`/api/admin/orders/${orderId}/archive`, { archived: true }),
  unarchive: () => post(`/api/admin/orders/${orderId}/archive`, { archived: false }),
  markPaid: (id) => post(`/api/admin/payment-collections/${id}/mark-as-paid`),
  collect: () => post('/api/admin/payment-collections', { orderId }),
  deliver: (id) => post(`/api/admin/orders/${orderId}/fulfillments/${id}/mark-as-delivered`),
  cancelShipment: (id) => post(`/api/admin/orders/${orderId}/fulfillments/${id}/cancel`),
  cancelReturn: (id) => post(`/api/admin/returns/${id}/cancel`),
  completeExchange: (id) => post(`/api/admin/exchanges/${id}/complete`),
  cancelExchange: (id) => post(`/api/admin/exchanges/${id}/cancel`),
  completeClaim: (id) => post(`/api/admin/claims/${id}/complete`),
  cancelClaim: (id) => post(`/api/admin/claims/${id}/cancel`),
}

async function runConfirm() {
  const kind = confirmKind.value
  if (!kind) return
  await mutate(CONFIRM_CALL[kind](confirmTarget.value))
  confirmKind.value = null
  confirmTarget.value = null
}

// --- Ship an already-prepared parcel (tracking) ------------------------------

const shipTarget = ref<string | null>(null)
const trackingNumber = ref('')

async function shipFulfillment() {
  const id = shipTarget.value
  if (!id) return
  const ok = await mutate(post(`/api/admin/orders/${orderId}/fulfillments/${id}/shipments`, trackingNumber.value.trim() ? { trackingNumber: trackingNumber.value.trim() } : {}))
  if (ok) {
    shipTarget.value = null
    trackingNumber.value = ''
  }
}

// --- Secondary actions menu ---------------------------------------------------

const menuItems = computed(() => {
  const a = abilities.value
  if (!a) return []
  const rma = [
    a.canReturn ? { label: t('actionReturn'), icon: 'i-lucide-rotate-ccw', to: `${base}/retour` } : null,
    a.canExchange ? { label: t('actionExchange'), icon: 'i-lucide-repeat', to: `${base}/echange` } : null,
    a.canClaim ? { label: t('actionClaim'), icon: 'i-lucide-message-square-warning', to: `${base}/reclamation` } : null,
    a.canRefund ? { label: t('actionRefund'), icon: 'i-lucide-undo-2', to: `${base}/rembourser` } : null,
    a.canEdit ? { label: t('actionEditOrder'), icon: 'i-lucide-pencil', to: `${base}/modifier` } : null,
  ].filter((x) => x !== null)
  const lifecycle = [
    a.canArchive ? { label: t('actionArchiveOrder'), icon: 'i-lucide-archive', onSelect: () => ask('archive') } : null,
    a.canUnarchive ? { label: t('actionUnarchiveOrder'), icon: 'i-lucide-archive-restore', onSelect: () => ask('unarchive') } : null,
    a.canCancel ? { label: t('actionCancelOrder'), icon: 'i-lucide-circle-x', color: 'error' as const, onSelect: () => ask('cancel') } : null,
    a.cancelBlocked ? { label: t(a.cancelBlocked), icon: 'i-lucide-info', disabled: true } : null,
  ].filter((x) => x !== null)
  return [rma, lifecycle].filter((group) => group.length)
})

// --- Derived activity feed ----------------------------------------------------

interface HistoryEntry { at: string; label: string; icon: string; cents?: number }

const history = computed<HistoryEntry[]>(() => {
  const o = order.value
  if (!o) return []
  const rows: HistoryEntry[] = [{ at: o.createdAt, label: t('histOrderPlaced'), icon: 'i-lucide-shopping-bag', cents: o.total }]
  for (const tx of o.transactions) {
    const label = tx.reference === 'refund' ? t('payTransactionRefund') : tx.reference === 'manual_payment' ? t('payTransactionManual') : t('payTransactionCapture')
    rows.push({ at: tx.createdAt, label, icon: tx.amount < 0 ? 'i-lucide-undo-2' : 'i-lucide-hand-coins', cents: Math.abs(tx.amount) })
  }
  for (const f of o.fulfillments) {
    rows.push({ at: f.createdAt, label: t('histFulfillmentCreated'), icon: 'i-lucide-package' })
    if (f.shippedAt) rows.push({ at: f.shippedAt, label: t('histShipmentCreated'), icon: 'i-lucide-truck' })
    if (f.deliveredAt) rows.push({ at: f.deliveredAt, label: t('histDelivered'), icon: 'i-lucide-house' })
    if (f.canceledAt) rows.push({ at: f.canceledAt, label: t('histFulfillmentCanceled'), icon: 'i-lucide-circle-x' })
  }
  for (const r of returns.value) {
    rows.push({ at: r.requestedAt, label: t('histReturnRequested'), icon: 'i-lucide-rotate-ccw' })
    if (r.receivedAt) rows.push({ at: r.receivedAt, label: t('histReturnReceived'), icon: 'i-lucide-package-check' })
    if (r.canceledAt) rows.push({ at: r.canceledAt, label: t('histReturnCanceled'), icon: 'i-lucide-circle-x' })
  }
  for (const e of exchanges.value) {
    rows.push({ at: e.createdAt, label: t('histExchangeCreated'), icon: 'i-lucide-repeat' })
    if (e.completedAt) rows.push({ at: e.completedAt, label: t('histExchangeCompleted'), icon: 'i-lucide-circle-check' })
  }
  for (const c of claims.value) {
    rows.push({ at: c.createdAt, label: t('histClaimCreated'), icon: 'i-lucide-message-square-warning' })
    if (c.completedAt) rows.push({ at: c.completedAt, label: t('histClaimCompleted'), icon: 'i-lucide-circle-check' })
  }
  if (o.canceledAt) rows.push({ at: o.canceledAt, label: t('histOrderCanceled'), icon: 'i-lucide-circle-x' })
  if (o.status === 'archived') rows.push({ at: o.createdAt, label: t('histOrderArchived'), icon: 'i-lucide-archive' })
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
})

const { formatDateTime } = useAdminFormat()
const lineTitle = (fulfillment: OrderFulfillment) => fulfillment.items.map((i) => `${i.quantity} × ${i.title}`).join(', ')
</script>

<template>
  <PygPage
    :title="order ? `${t('orderNumberPrefix')}${order.displayId}` : t('loading')"
    :description="order ? `${formatDateTime(order.createdAt)} · ${order.email ?? t('orderGuest')}` : undefined"
    back-to="/admin/commandes"
  >
    <template v-if="order" #actions>
      <UDropdownMenu v-if="menuItems.length" :items="menuItems">
        <UButton color="neutral" variant="outline" icon="i-lucide-ellipsis" :label="t('actionMore')" />
      </UDropdownMenu>
    </template>

    <div v-if="loading && !order" class="flex flex-col gap-4" role="status" aria-live="polite">
      <USkeleton class="h-28 w-full rounded-2xl bg-muted" />
      <USkeleton class="h-64 w-full rounded-2xl bg-muted" />
    </div>

    <UAlert
      v-else-if="error || !order"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="t('errorGeneric')"
    />

    <div v-else class="flex flex-col gap-6">
      <!-- Next step (never wonder what to do next) -->
      <UCard v-if="step" :ui="{ body: 'flex flex-col sm:flex-row sm:items-center gap-4 justify-between' }">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-flag" class="size-6 text-primary shrink-0" />
          <div>
            <p class="text-xs text-dimmed uppercase">{{ t('orderNextStep') }}</p>
            <p class="text-lg font-bold text-highlighted">
              {{ step === 'capture' ? t('actionCapture') : step === 'ship' ? t('actionShip') : step === 'deliver' ? t('actionMarkDelivered') : t('actionReceiveReturn') }}
            </p>
          </div>
        </div>
        <UButton v-if="step === 'capture'" size="lg" icon="i-lucide-hand-coins" :label="t('actionCapture')" :loading="busy" @click="ask('capture')" />
        <UButton v-else-if="step === 'ship'" size="lg" icon="i-lucide-truck" :label="t('actionShip')" :to="`${base}/expedier`" />
        <UButton v-else-if="step === 'receiveReturn' && openReturn" size="lg" icon="i-lucide-package-open" :label="t('actionReceiveReturn')" :to="`${base}/retours/${openReturn.id}`" />
        <UButton v-else size="lg" color="neutral" variant="outline" icon="i-lucide-house" :label="t('actionMarkDelivered')" :loading="busy" @click="ask('deliver', order.fulfillments.find((f) => f.shippedAt && !f.deliveredAt && !f.canceledAt)?.id ?? null)" />
      </UCard>

      <!-- Argent -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionPayments') }}</h2>
            <div class="flex flex-wrap items-center gap-2">
              <PygStatus
                :tone="paymentStatusView(order.paymentStatus).tone"
                :icon="paymentStatusView(order.paymentStatus).icon"
                :label="t(paymentStatusView(order.paymentStatus).key)"
              />
              <PygStatus
                :tone="fulfillmentStatusView(order.fulfillmentStatus).tone"
                :icon="fulfillmentStatusView(order.fulfillmentStatus).icon"
                :label="t(fulfillmentStatusView(order.fulfillmentStatus).key)"
              />
            </div>
          </div>
        </template>

        <div class="flex flex-col gap-6">
          <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p class="text-xs text-dimmed uppercase">{{ t('labelTotal') }}</p>
              <PygMoney :cents="order.total" :currency="order.currencyCode" size="xl" />
            </div>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt class="text-muted">{{ t('labelSubtotal') }}</dt>
              <dd class="text-right"><PygMoney :cents="order.itemsSubtotal" :currency="order.currencyCode" size="sm" /></dd>
              <dt class="text-muted">{{ t('labelDiscount') }}</dt>
              <dd class="text-right"><PygMoney :cents="order.discountTotal ? -order.discountTotal : 0" :currency="order.currencyCode" size="sm" /></dd>
              <dt class="text-muted">{{ t('labelShippingCost') }}</dt>
              <dd class="text-right"><PygMoney :cents="order.shippingTotal" :currency="order.currencyCode" size="sm" /></dd>
              <dt class="text-muted">{{ t('labelTax') }}</dt>
              <dd class="text-right"><PygMoney :cents="order.taxTotal" :currency="order.currencyCode" size="sm" /></dd>
            </dl>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="rounded-xl bg-muted p-3">
              <p class="text-xs text-dimmed">{{ t('labelPaid') }}</p>
              <PygMoney :cents="order.capturedAmount" :currency="order.currencyCode" size="md" />
            </div>
            <div class="rounded-xl bg-muted p-3">
              <p class="text-xs text-dimmed">{{ t('labelRefunded') }}</p>
              <PygMoney :cents="order.refundedAmount" :currency="order.currencyCode" size="md" />
            </div>
            <div class="rounded-xl bg-muted p-3">
              <p class="text-xs text-dimmed">{{ t('labelOutstanding') }}</p>
              <PygMoney :cents="leftToCollect(order)" :currency="order.currencyCode" size="md" />
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton v-if="abilities?.canCapture" icon="i-lucide-hand-coins" :loading="busy" @click="ask('capture')">
              {{ t('actionCapture') }}
              <PygMoney :cents="capturable(order)" :currency="order.currencyCode" size="sm" />
            </UButton>
            <UButton
              v-if="abilities?.canRefund"
              color="neutral"
              variant="outline"
              icon="i-lucide-undo-2"
              :label="t('actionRefund')"
              :to="`${base}/rembourser`"
            />
            <UButton
              v-if="abilities?.canCollectMore"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('actionCreateCollection')"
              :loading="busy"
              @click="ask('collect')"
            />
          </div>
          <p v-if="leftToCollect(order) === 0" class="text-sm text-muted">{{ t('payNothingDue') }}</p>

          <!-- Payment collections (including the additional ones of an edit or exchange) -->
          <div v-if="order.paymentCollections.length" class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold text-muted">{{ t('payCollections') }}</h3>
            <div
              v-for="collection in order.paymentCollections"
              :key="collection.id"
              class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default p-3"
            >
              <div class="flex items-center gap-3">
                <PygMoney :cents="collection.amount" :currency="collection.currencyCode" size="md" />
                <PygStatus
                  :tone="paymentStatusView(collection.status).tone"
                  :icon="paymentStatusView(collection.status).icon"
                  :label="t(paymentStatusView(collection.status).key)"
                />
              </div>
              <UButton
                v-if="collectionCanBeMarkedPaid(collection)"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-banknote"
                class="pyg-tap-target"
                :label="t('actionMarkAsPaid')"
                :loading="busy"
                @click="ask('markPaid', collection.id)"
              />
            </div>
          </div>

          <!-- Journal financier append-only -->
          <div v-if="order.transactions.length" class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold text-muted">{{ t('payTransactions') }}</h3>
            <ul class="flex flex-col gap-1 text-sm">
              <li v-for="tx in order.transactions" :key="tx.id" class="flex items-center justify-between gap-3 py-1">
                <span class="flex items-center gap-2 text-muted">
                  <UIcon :name="tx.amount < 0 ? 'i-lucide-undo-2' : 'i-lucide-hand-coins'" class="size-4" />
                  {{ tx.reference === 'refund' ? t('payTransactionRefund') : tx.reference === 'manual_payment' ? t('payTransactionManual') : t('payTransactionCapture') }}
                  <span class="text-dimmed">{{ formatDateTime(tx.createdAt) }}</span>
                </span>
                <PygMoney :cents="tx.amount" :currency="tx.currencyCode" size="sm" />
              </li>
            </ul>
          </div>
        </div>
      </UCard>

      <!-- Where it goes: the address is joined by GET /admin/orders/:id, so the
           merchant can prepare the parcel from this screen. -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionAddress') }}</h2>
        </template>
        <address v-if="order.shippingAddress" class="not-italic text-base text-default leading-relaxed">
          <span class="font-semibold text-highlighted">
            {{ [order.shippingAddress.firstName, order.shippingAddress.lastName].filter(Boolean).join(' ') }}
          </span><br>
          <template v-if="order.shippingAddress.company">{{ order.shippingAddress.company }}<br></template>
          {{ order.shippingAddress.address1 }}<br>
          <template v-if="order.shippingAddress.address2">{{ order.shippingAddress.address2 }}<br></template>
          {{ [order.shippingAddress.postalCode, order.shippingAddress.city].filter(Boolean).join(' ') }}<br>
          {{ [order.shippingAddress.province, order.shippingAddress.countryCode].filter(Boolean).join(' · ') }}
          <template v-if="order.shippingAddress.phone"><br>{{ order.shippingAddress.phone }}</template>
        </address>
        <p v-else class="text-sm text-muted">{{ t('orderNoAddress') }}</p>
      </UCard>

      <!-- Articles -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionItems') }}</h2>
        </template>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="line in order.items" :key="line.id" class="flex items-center gap-3 py-3">
            <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="size-14 rounded-xl object-cover border border-default" >
            <div v-else class="size-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-image" class="size-6 text-dimmed" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted truncate">{{ line.title }}</p>
              <p class="text-sm text-muted">{{ line.quantity }} × <PygMoney :cents="line.unitPrice" :currency="order.currencyCode" size="sm" /></p>
            </div>
            <PygMoney :cents="line.total" :currency="order.currencyCode" size="md" />
          </li>
        </ul>
        <div v-if="order.shippingMethods.length" class="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-default text-sm">
          <span class="text-muted">{{ order.shippingMethods[0]?.name }}</span>
          <PygMoney :cents="order.shippingMethods[0]?.total ?? 0" :currency="order.currencyCode" size="sm" />
        </div>
      </UCard>

      <!-- Expéditions -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionShipments') }}</h2>
            <UButton v-if="abilities?.canShip" size="sm" icon="i-lucide-truck" :label="t('actionShip')" :to="`${base}/expedier`" />
          </div>
        </template>

        <PygEmptyState
          v-if="!order.fulfillments.length"
          icon="i-lucide-package"
          :title="t('shipStatusNotFulfilled')"
          :description="abilities?.canShip ? t('shipmentsEmptyDescription') : t('whyNoShip')"
        />
        <ul v-else class="flex flex-col divide-y divide-default">
          <li v-for="f in order.fulfillments" :key="f.id" class="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <PygStatus
                  :tone="fulfillmentStatusView(fulfillmentRowStatus(f)).tone"
                  :icon="fulfillmentStatusView(fulfillmentRowStatus(f)).icon"
                  :label="t(fulfillmentStatusView(fulfillmentRowStatus(f)).key)"
                />
                <span class="text-xs text-dimmed">{{ formatDateTime(f.createdAt) }}</span>
              </div>
              <p class="text-sm text-muted mt-1 truncate">{{ lineTitle(f) }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="fulfillmentAbilities(f).canShip"
                size="sm"
                icon="i-lucide-truck"
                class="pyg-tap-target"
                :label="t('actionShip')"
                @click="shipTarget = f.id"
              />
              <UButton
                v-if="fulfillmentAbilities(f).canDeliver"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-house"
                class="pyg-tap-target"
                :label="t('actionMarkDelivered')"
                :loading="busy"
                @click="ask('deliver', f.id)"
              />
              <UButton
                v-if="fulfillmentAbilities(f).canCancel"
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-circle-x"
                class="pyg-tap-target"
                :label="t('actionCancelShipment')"
                :loading="busy"
                @click="ask('cancelShipment', f.id)"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Retours -->
      <UCard v-if="returns.length || abilities?.canReturn">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionReturns') }}</h2>
            <UButton v-if="abilities?.canReturn" size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" :label="t('actionReturn')" :to="`${base}/retour`" />
          </div>
        </template>

        <PygEmptyState
          v-if="!returns.length"
          icon="i-lucide-rotate-ccw"
          :title="t('ordersEmptyReturnsTitle')"
          :description="t('wizReturnLinesDescription')"
        />
        <ul v-else class="flex flex-col divide-y divide-default">
          <li v-for="r in returns" :key="r.id" class="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <div class="min-w-0 flex-1 flex items-center gap-2">
              <PygStatus
                :tone="returnStatusView(r.status).tone"
                :icon="returnStatusView(r.status).icon"
                :label="t(returnStatusView(r.status).key)"
              />
              <span class="text-xs text-dimmed">{{ formatDateTime(r.requestedAt) }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton size="sm" color="neutral" variant="outline" class="pyg-tap-target" icon="i-lucide-package-open" :label="returnAbilities(r).canReceive ? t('actionReceiveReturn') : t('actionOpenReturn')" :to="`${base}/retours/${r.id}`" />
              <UButton
                v-if="returnAbilities(r).canCancel"
                size="sm"
                color="error"
                variant="ghost"
                class="pyg-tap-target"
                icon="i-lucide-circle-x"
                :label="t('actionCancelReturn')"
                :loading="busy"
                @click="ask('cancelReturn', r.id)"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Échanges -->
      <UCard v-if="exchanges.length">
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionExchanges') }}</h2>
        </template>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="e in exchanges" :key="e.id" class="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <PygStatus :tone="rmaStatusView(e.status).tone" :icon="rmaStatusView(e.status).icon" :label="t(rmaStatusView(e.status).key)" />
                <span class="text-xs text-dimmed">{{ formatDateTime(e.createdAt) }}</span>
              </div>
              <p class="text-sm text-muted mt-1">
                <template v-if="(e.differenceDue ?? 0) > 0">{{ t('wizDifferenceOwed') }} <PygMoney :cents="e.differenceDue ?? 0" :currency="order.currencyCode" size="sm" /></template>
                <template v-else-if="(e.differenceDue ?? 0) < 0">{{ t('wizDifferenceRefund') }} <PygMoney :cents="-(e.differenceDue ?? 0)" :currency="order.currencyCode" size="sm" /></template>
                <template v-else>{{ t('wizDifferenceEven') }}</template>
              </p>
              <p v-if="rmaAbilities(e.status, inboundOf(e.id, 'exchange')).completeBlocked" class="text-xs text-warning mt-1">
                {{ t('whyNoExchangeComplete') }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="rmaAbilities(e.status, inboundOf(e.id, 'exchange')).canComplete"
                size="sm"
                class="pyg-tap-target"
                icon="i-lucide-circle-check"
                :label="t('actionCompleteExchange')"
                :loading="busy"
                @click="ask('completeExchange', e.id)"
              />
              <UButton
                v-if="rmaAbilities(e.status, inboundOf(e.id, 'exchange')).canCancel"
                size="sm"
                color="error"
                variant="ghost"
                class="pyg-tap-target"
                icon="i-lucide-circle-x"
                :label="t('actionCancelExchange')"
                :loading="busy"
                @click="ask('cancelExchange', e.id)"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Réclamations -->
      <UCard v-if="claims.length">
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionClaims') }}</h2>
        </template>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="c in claims" :key="c.id" class="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <PygStatus :tone="rmaStatusView(c.status).tone" :icon="rmaStatusView(c.status).icon" :label="t(rmaStatusView(c.status).key)" />
                <span class="text-xs text-dimmed">{{ c.type === 'refund' ? t('claimTypeRefund') : t('claimTypeReplace') }}</span>
              </div>
              <p v-if="c.refundAmount" class="text-sm text-muted mt-1">
                {{ t('claimRefundAmountTitle') }} <PygMoney :cents="c.refundAmount" :currency="order.currencyCode" size="sm" />
              </p>
              <p v-if="rmaAbilities(c.status, inboundOf(c.id, 'claim')).completeBlocked" class="text-xs text-warning mt-1">
                {{ t('whyNoExchangeComplete') }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="rmaAbilities(c.status, inboundOf(c.id, 'claim')).canComplete"
                size="sm"
                class="pyg-tap-target"
                icon="i-lucide-circle-check"
                :label="t('actionCompleteClaim')"
                :loading="busy"
                @click="ask('completeClaim', c.id)"
              />
              <UButton
                v-if="rmaAbilities(c.status, inboundOf(c.id, 'claim')).canCancel"
                size="sm"
                color="error"
                variant="ghost"
                class="pyg-tap-target"
                icon="i-lucide-circle-x"
                :label="t('actionCancelClaim')"
                :loading="busy"
                @click="ask('cancelClaim', c.id)"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <!-- Historique -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-bold text-highlighted">{{ t('orderSectionHistory') }}</h2>
        </template>
        <PygEmptyState v-if="!history.length" icon="i-lucide-history" :title="t('histEmptyTitle')" :description="t('histEmptyDescription')" />
        <ol v-else class="flex flex-col gap-4">
          <li v-for="(entry, index) in history" :key="`${entry.at}-${index}`" class="flex items-start gap-3">
            <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <UIcon :name="entry.icon" class="size-4 text-muted" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-highlighted">{{ entry.label }}</p>
              <p class="text-xs text-dimmed">{{ formatDateTime(entry.at) }}</p>
            </div>
            <PygMoney v-if="entry.cents !== undefined" :cents="entry.cents" :currency="order.currencyCode" size="sm" />
          </li>
        </ol>
      </UCard>
    </div>

    <PygConfirm
      :open="confirmKind !== null"
      :title="confirmKind ? CONFIRM_COPY[confirmKind].title() : ''"
      :description="confirmKind ? CONFIRM_COPY[confirmKind].body() : ''"
      :danger="confirmKind ? CONFIRM_COPY[confirmKind].danger : true"
      :loading="busy"
      @update:open="(value) => { if (!value) confirmKind = null }"
      @confirm="runConfirm"
    />

    <UModal :open="shipTarget !== null" @update:open="(value) => { if (!value) shipTarget = null }">
      <template #header>
        <h2 class="text-lg font-bold text-highlighted">{{ t('wizTrackingTitle') }}</h2>
      </template>
      <template #body>
        <UFormField :label="t('labelTracking')" :hint="t('labelOptional')" :description="t('wizTrackingDescription')">
          <UInput v-model="trackingNumber" size="lg" />
        </UFormField>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" block class="sm:w-auto" :label="t('cancel')" @click="shipTarget = null" />
        <UButton block class="sm:w-auto" icon="i-lucide-truck" :label="t('actionShip')" :loading="busy" @click="shipFulfillment" />
      </template>
    </UModal>
  </PygPage>
</template>
