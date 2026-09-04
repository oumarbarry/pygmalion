<script setup lang="ts">
/**
 * Status = icon + colour + label, never colour alone.
 * `tone` is the only thing screens choose from; `icon` only needs an
 * override for a status the default map doesn't cover.
 */
export type PygStatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const props = defineProps<{
  label: string
  tone: PygStatusTone
  icon?: string
}>()

const defaultIcon: Record<PygStatusTone, string> = {
  success: 'i-lucide-circle-check',
  warning: 'i-lucide-triangle-alert',
  error: 'i-lucide-circle-x',
  info: 'i-lucide-info',
  neutral: 'i-lucide-circle-dashed',
}

const resolvedIcon = computed(() => props.icon ?? defaultIcon[props.tone])
</script>

<template>
  <UBadge :color="tone" variant="soft" :icon="resolvedIcon" :label="label" />
</template>
