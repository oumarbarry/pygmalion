<script setup lang="ts">
import type { StoreOrder } from '@oumarbarry/pygmalion-sdk'

/**
 * One order, as its buyer reads it — used by the confirmation page and by the
 * account. Statuses are translated into a sentence about the parcel, not the
 * enum the admin sees.
 *
 * The return form appears only for lines the server would actually accept:
 * `returnableQuantity` is shipped − already-requested, computed by
 * `returns.returnableByLine` and carried by `GET /api/store/orders/:id`.
 */
const props = defineProps<{ order: StoreOrder; guestEmail?: string; showReturn?: boolean }>()
const emit = defineEmits<{ returned: [] }>()

const client = usePygmalion()
const { t, tf, one, money, formatDate } = useShopText()
const currency = computed(() => props.order.currencyCode)
const headline = computed(() => orderHeadline(props.order))
const placedAt = computed(() => formatDate(props.order.createdAt))
const returnable = computed(() => props.order.items.filter((i) => i.returnableQuantity > 0))

// Deliberately NOT awaited: the return reasons fill a select the shopper only
// sees after opening the form. Awaiting here would make this an async component
// that suspends the page a second time, the moment the order data arrives.
const { data: reasons } = useAsyncData('store:return-reasons', () => client.store.returnReasons.list(), {
  default: () => ({ returnReasons: [] }),
  lazy: true,
})

// `NO_REASON` rather than '': Reka's Select reserves the empty string for
// "no selection, show the placeholder" and throws on an item that uses it.
const NO_REASON = 'none'
const reasonItems = computed(() => [
  { value: NO_REASON, label: t('orderReturnNoReason') },
  ...reasons.value.returnReasons.map((r) => ({ value: r.id, label: r.label })),
])

const openForm = ref(false)
const picked = ref<Record<string, number>>({})
const reasonId = ref(NO_REASON)
const note = ref('')
const busy = ref(false)
const error = ref('')
const done = ref(false)

const pickedTotal = computed(() => Object.values(picked.value).reduce((a, n) => a + n, 0))

async function requestReturn() {
  const items = Object.entries(picked.value)
    .filter(([, q]) => q > 0)
    .map(([lineItemId, quantity]) => ({
      lineItemId,
      quantity,
      reasonId: reasonId.value === NO_REASON ? null : reasonId.value,
      note: note.value || null,
    }))
  if (!items.length) return
  busy.value = true
  error.value = ''
  try {
    await client.store.returns.create({ orderId: props.order.id, email: props.guestEmail, items })
    done.value = true
    openForm.value = false
    picked.value = {}
    emit('returned')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <article>
    <header class="flex flex-wrap items-start justify-between gap-4 border-b border-default pb-6">
      <div>
        <p class="text-sm text-muted">{{ tf('orderPlacedOn', { date: placedAt }) }}</p>
        <h2 class="shop-display mt-1 text-2xl text-highlighted" data-testid="order-number">
          {{ tf('orderNumber', { id: order.displayId }) }}
        </h2>
        <p class="sr-only" data-testid="order-id">{{ order.id }}</p>
      </div>
      <UBadge
        :color="headline.tone === 'neutral' ? 'neutral' : headline.tone"
        variant="soft"
        size="lg"
        :label="t(headline.key)"
        data-testid="order-status"
      />
    </header>

    <ul class="divide-y divide-default">
      <li v-for="line in order.items" :key="line.id" class="flex gap-4 py-5" data-testid="order-line">
        <img
          v-if="line.thumbnail"
          :src="line.thumbnail"
          alt=""
          width="72"
          height="90"
          class="shop-media h-22 w-18 shrink-0 rounded-lg object-cover"
        >
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-highlighted">{{ line.title }}</p>
          <p v-if="line.sku" class="mt-0.5 text-sm text-dimmed">{{ line.sku }}</p>
          <p class="mt-1 text-sm text-muted">{{ tf('commonQuantity', { count: line.quantity }) }}</p>
          <p v-if="line.returnableQuantity > 0" class="mt-1 text-xs text-muted">
            {{ tf(one(line.returnableQuantity) ? 'orderReturnableOne' : 'orderReturnableOther', { count: line.returnableQuantity }) }}
          </p>
        </div>
        <p class="shop-price text-highlighted" :data-amount="line.total">
          {{ money(line.total, currency) }}
        </p>
      </li>
    </ul>

    <div class="grid gap-8 border-t border-default pt-6 sm:grid-cols-2">
      <div v-if="order.shippingAddress">
        <h3 class="text-sm font-semibold text-highlighted">{{ t('commonShipping') }}</h3>
        <address class="mt-2 text-sm not-italic leading-relaxed text-muted">
          {{ order.shippingAddress.firstName }} {{ order.shippingAddress.lastName }}<br>
          {{ order.shippingAddress.address1 }}<br>
          <template v-if="order.shippingAddress.address2">{{ order.shippingAddress.address2 }}<br></template>
          {{ order.shippingAddress.postalCode }} {{ order.shippingAddress.city }}<br>
          {{ order.shippingAddress.countryCode?.toUpperCase() }}
        </address>
        <p v-if="order.shippingMethods[0]" class="mt-2 text-sm text-muted">{{ order.shippingMethods[0].name }}</p>
      </div>

      <dl class="space-y-2 text-sm sm:justify-self-end sm:w-64">
        <div class="flex justify-between">
          <dt class="text-muted">{{ t('commonSubtotal') }}</dt>
          <dd class="shop-num text-toned">{{ money(order.itemsSubtotal, currency) }}</dd>
        </div>
        <div v-if="order.discountTotal > 0" class="flex justify-between">
          <dt class="text-muted">{{ t('commonDiscount') }}</dt>
          <dd class="shop-num text-toned">−{{ money(order.discountTotal, currency) }}</dd>
        </div>
        <div v-if="order.shippingTotal > 0" class="flex justify-between">
          <dt class="text-muted">{{ t('commonShipping') }}</dt>
          <dd class="shop-num text-toned">{{ money(order.shippingTotal, currency) }}</dd>
        </div>
        <div v-if="order.taxTotal > 0" class="flex justify-between">
          <dt class="text-muted">{{ t('commonTaxes') }}</dt>
          <dd class="shop-num text-toned">{{ money(order.taxTotal, currency) }}</dd>
        </div>
        <div class="flex justify-between border-t border-default pt-2">
          <dt class="font-semibold text-highlighted">{{ t('commonTotal') }}</dt>
          <dd class="shop-price text-lg text-highlighted" :data-amount="order.total" data-testid="order-total">
            {{ money(order.total, currency) }}
          </dd>
        </div>
        <p class="pt-1 text-xs text-dimmed">{{ t(paymentLabel(order.paymentStatus).key) }}</p>
      </dl>
    </div>

    <!-- Returns: offered only where the API would accept one. -->
    <section v-if="showReturn && returnable.length" class="mt-8 border-t border-default pt-6">
      <p v-if="done" class="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success" data-testid="return-done">
        {{ t('orderReturnDone') }}
      </p>

      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-sm font-semibold text-highlighted">{{ t('orderReturnPrompt') }}</h3>
          <UButton
            size="sm"
            color="neutral"
            :variant="openForm ? 'ghost' : 'outline'"
            :label="t(openForm ? 'commonCancel' : 'orderRequestReturn')"
            data-testid="open-return"
            @click="openForm = !openForm"
          />
        </div>

        <form v-if="openForm" class="mt-4 space-y-4" @submit.prevent="requestReturn">
          <ul class="space-y-3">
            <li v-for="line in returnable" :key="line.id" class="flex items-center justify-between gap-4">
              <span class="text-sm text-toned">{{ line.title }}</span>
              <USelect
                :model-value="picked[line.id] ?? 0"
                :items="Array.from({ length: line.returnableQuantity + 1 }, (_, n) => ({ value: n, label: String(n) }))"
                class="w-24"
                :aria-label="tf('orderReturnQuantityFor', { title: line.title })"
                :data-return-line="line.id"
                @update:model-value="picked = { ...picked, [line.id]: Number($event) }"
              />
            </li>
          </ul>

          <UFormField :label="t('orderReturnReason')" :hint="t('commonOptional')">
            <USelect
              v-model="reasonId"
              :items="reasonItems"
              class="w-full sm:max-w-xs"
            />
          </UFormField>
          <UFormField :label="t('orderReturnNote')" :hint="t('commonOptional')">
            <UTextarea v-model="note" :rows="2" class="w-full sm:max-w-md" />
          </UFormField>

          <p v-if="error" class="text-sm text-error" role="alert" data-testid="return-error">{{ error }}</p>
          <UButton
            type="submit"
            color="primary"
            :loading="busy"
            :disabled="pickedTotal === 0"
            :label="t('orderSendReturn')"
            data-testid="submit-return"
          />
        </form>
      </template>
    </section>
  </article>
</template>
