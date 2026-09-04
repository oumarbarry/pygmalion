<script setup lang="ts">
import type { Order } from '@oumarbarry/pygmalion-core'

/**
 * One line of the order history. `GET /api/store/orders` returns raw order rows
 * (no derived fulfillment status), so the headline here falls back to the
 * payment/order status; the detail page has the full picture.
 */
const props = defineProps<{ order: Order & { paymentStatus?: string } }>()

const headline = computed(() =>
  orderHeadline({ status: props.order.status, paymentStatus: props.order.paymentStatus ?? 'captured' }),
)
const placedAt = computed(() =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(props.order.createdAt)),
)
</script>

<template>
  <li>
    <NuxtLink
      :to="`/account/orders/${order.id}`"
      class="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 transition-colors hover:bg-muted/40"
      data-testid="order-row"
    >
      <span class="font-semibold text-highlighted">N° {{ order.displayId }}</span>
      <span class="text-sm text-muted">{{ placedAt }}</span>
      <UBadge :color="headline.tone === 'neutral' ? 'neutral' : headline.tone" variant="soft" :label="headline.label" />
      <span class="shop-price ml-auto text-highlighted" :data-amount="order.total">
        {{ formatMoney(order.total, order.currencyCode) }}
      </span>
      <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
    </NuxtLink>
  </li>
</template>
