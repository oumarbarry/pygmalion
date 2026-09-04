<script setup lang="ts">
import type { FullCart } from '@oumarbarry/pygmalion-core'

/**
 * The totals block — cart drawer, cart page, checkout summary.
 *
 * Every figure is read straight off the cart the API returned: nothing is
 * summed, discounted or taxed here. `data-amount` carries the raw minor units
 * next to the formatted string so a test can assert on the number the server
 * actually computed.
 */
const props = defineProps<{ cart: FullCart | null; showShippingHint?: boolean }>()

const currency = computed(() => props.cart?.currencyCode)
const rows = computed(() => {
  const c = props.cart
  if (!c) return []
  return [
    { key: 'subtotal', label: 'Sous-total', amount: c.itemsSubtotal, show: true },
    { key: 'discount', label: 'Remise', amount: -c.discountTotal, show: c.discountTotal > 0 },
    { key: 'shipping', label: 'Livraison', amount: c.shippingTotal, show: c.shippingMethods.length > 0 },
    { key: 'tax', label: 'Taxes', amount: c.taxTotal, show: c.taxTotal > 0 },
  ].filter((r) => r.show)
})
</script>

<template>
  <dl v-if="cart" class="space-y-2 text-sm">
    <div v-for="row in rows" :key="row.key" class="flex items-baseline justify-between">
      <dt class="text-muted">{{ row.label }}</dt>
      <dd class="shop-num text-toned" :data-amount="row.amount" :data-testid="`cart-${row.key}`">
        {{ formatMoney(row.amount, currency) }}
      </dd>
    </div>
    <div
      v-if="showShippingHint && !cart.shippingMethods.length"
      class="flex items-baseline justify-between text-muted"
    >
      <dt>Livraison</dt>
      <dd class="text-xs">calculée à l'étape suivante</dd>
    </div>
    <div class="flex items-baseline justify-between border-t border-default pt-2.5">
      <dt class="font-semibold text-highlighted">Total</dt>
      <dd class="shop-price text-lg text-highlighted" :data-amount="cart.total" data-testid="cart-total">
        {{ formatMoney(cart.total, currency) }}
      </dd>
    </div>
  </dl>
</template>
