<script setup lang="ts">
import type { FullCart } from '@oumarbarry/pygmalion-core'

/**
 * The basket, on the right edge.
 *
 * Built on the native `<dialog>`: focus trap, Escape, background inert and the
 * modal ARIA semantics are the platform's job, not ours. `.shop-drawer` in
 * storefront.css does the placement and the entrance.
 */
const props = defineProps<{
  open: boolean
  cart: FullCart | null
  promoCodes: string[]
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  updateQuantity: [lineId: string, quantity: number]
  remove: [lineId: string]
  applyCode: [code: string]
  removeCode: [code: string]
}>()

const { t, tf, money } = useShopText()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const code = ref('')
const codeError = ref('')

watch(
  () => props.open,
  (open) => {
    const el = dialog.value
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  },
)

const lines = computed(() => props.cart?.items ?? [])
const currency = computed(() => props.cart?.currencyCode)
const isEmpty = computed(() => lines.value.length === 0)

function submitCode() {
  const value = code.value.trim()
  if (!value) return
  codeError.value = ''
  emit('applyCode', value)
  code.value = ''
}

/** The parent tells us a code was refused — the drawer only renders it. */
defineExpose({ setCodeError: (m: string) => (codeError.value = m) })
</script>

<template>
  <dialog
    ref="dialog"
    class="shop-drawer bg-default text-default"
    :aria-label="t('cartTitle')"
    @close="emit('close')"
    @cancel.prevent="emit('close')"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-default px-5 py-4">
        <h2 class="text-base font-bold text-highlighted">
          {{ t('cartTitle') }} <span v-if="lines.length" class="font-normal text-muted">({{ lines.length }})</span>
        </h2>
        <UButton color="neutral" variant="ghost" square icon="i-lucide-x" :aria-label="t('cartClose')" @click="emit('close')" />
      </div>

      <div v-if="isEmpty" class="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <UIcon name="i-lucide-shopping-bag" class="size-9 text-dimmed" />
        <div>
          <p class="font-semibold text-highlighted">{{ t('cartEmptyTitle') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('cartEmptyDrawerMessage') }}</p>
        </div>
        <UButton to="/products" :label="t('commonBrowseShop')" color="primary" @click="emit('close')" />
      </div>

      <template v-else>
        <ul class="flex-1 divide-y divide-default overflow-y-auto px-5">
          <li v-for="line in lines" :key="line.id" class="flex gap-4 py-4" data-testid="drawer-line">
            <img
              v-if="line.thumbnail"
              :src="line.thumbnail"
              alt=""
              width="72"
              height="90"
              class="shop-media size-18 shrink-0 rounded-lg object-cover"
            >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-highlighted">{{ line.title }}</p>
              <p class="shop-num mt-0.5 text-sm text-muted">{{ money(line.unitPrice, currency) }}</p>

              <div class="mt-2.5 flex items-center gap-2">
                <QuantityStepper
                  :quantity="line.quantity"
                  :disabled="busy"
                  :label="tf('commonQuantityFor', { title: line.title })"
                  @update="emit('updateQuantity', line.id, $event)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :label="t('commonRemove')"
                  :disabled="busy"
                  @click="emit('remove', line.id)"
                />
              </div>
            </div>
            <p class="shop-price text-sm text-highlighted">{{ money(line.total, currency) }}</p>
          </li>
        </ul>

        <div class="border-t border-default px-5 py-4">
          <form class="flex gap-2" @submit.prevent="submitCode">
            <UInput
              v-model="code"
              :placeholder="t('cartPromoCode')"
              size="sm"
              class="flex-1"
              :aria-label="t('cartPromoCode')"
              data-testid="promo-input"
            />
            <UButton type="submit" size="sm" color="neutral" variant="outline" :label="t('cartApply')" :loading="busy" />
          </form>
          <p v-if="codeError" class="mt-2 text-xs text-error" role="alert" data-testid="promo-error">{{ codeError }}</p>
          <ul v-if="promoCodes.length" class="mt-2.5 flex flex-wrap gap-1.5">
            <li v-for="c in promoCodes" :key="c">
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                trailing-icon="i-lucide-x"
                :label="c"
                :aria-label="tf('cartRemoveCode', { code: c })"
                data-testid="promo-chip"
                @click="emit('removeCode', c)"
              />
            </li>
          </ul>

          <CartTotals :cart="cart" class="mt-4" />

          <UButton
            to="/checkout"
            block
            size="lg"
            color="primary"
            :label="t('cartCheckout')"
            class="mt-4"
            data-testid="drawer-checkout"
            @click="emit('close')"
          />
          <p class="mt-2 text-center text-xs text-dimmed">{{ t('cartShippingNote') }}</p>
        </div>
      </template>
    </div>
  </dialog>
</template>
