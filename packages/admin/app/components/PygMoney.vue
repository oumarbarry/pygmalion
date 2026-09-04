<script setup lang="ts">
/**
 * Money is integer minor units (cents) + currency code, never a float.
 * Amounts are shown big: size defaults to a large, bold,
 * tabular-figure treatment; table cells opt into `size="sm"`.
 */
const props = withDefaults(defineProps<{
  cents: number
  currency?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  currency: 'EUR',
  size: 'lg',
})

const sizeClass: Record<NonNullable<typeof props.size>, string> = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-2xl sm:text-3xl',
  xl: 'text-3xl sm:text-4xl',
}

const { money } = useAdminFormat()
const formatted = computed(() => money(props.cents, props.currency))
</script>

<template>
  <span class="pyg-money" :class="sizeClass[size]">{{ formatted }}</span>
</template>
