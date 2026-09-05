<script setup lang="ts">
/**
 * −/n/+ on one line. Emits the NEW quantity; going below 1 is the caller's
 * decision (the cart turns it into a removal), so this never emits 0 on its own.
 */
const props = withDefaults(defineProps<{ quantity: number; disabled?: boolean; max?: number; label: string }>(), {
  max: 99,
})
const emit = defineEmits<{ update: [quantity: number] }>()
const { t } = useShopText()

const step = (delta: number) => emit('update', Math.min(props.max, Math.max(1, props.quantity + delta)))
</script>

<template>
  <div class="inline-flex items-center rounded-lg border border-default" role="group" :aria-label="label">
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-muted hover:text-highlighted disabled:opacity-40"
      :disabled="disabled || quantity <= 1"
      :aria-label="t('commonDecrease')"
      @click="step(-1)"
    >
      <UIcon name="i-lucide-minus" class="size-4" />
    </button>
    <span class="shop-num w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{{ quantity }}</span>
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-muted hover:text-highlighted disabled:opacity-40"
      :disabled="disabled || quantity >= max"
      :aria-label="t('commonIncrease')"
      @click="step(1)"
    >
      <UIcon name="i-lucide-plus" class="size-4" />
    </button>
  </div>
</template>
