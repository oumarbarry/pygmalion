<script setup lang="ts">
import type { CheckoutStep } from '@oumarbarry/pygmalion/runtime/app/composables/use-checkout'

const props = defineProps<{ step: CheckoutStep }>()

const STEPS = [
  { key: 'email', label: 'Coordonnées' },
  { key: 'address', label: 'Adresse' },
  { key: 'shipping', label: 'Livraison' },
  { key: 'payment', label: 'Paiement' },
] as const

const currentIndex = computed(() => {
  const i = STEPS.findIndex((s) => s.key === props.step)
  return i === -1 ? STEPS.length : i // 'done' sits past the last step
})
</script>

<template>
  <ol class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Étapes de la commande">
    <li v-for="(s, i) in STEPS" :key="s.key" class="flex items-center gap-2">
      <span
        class="flex size-6 items-center justify-center rounded-full text-xs font-bold"
        :class="
          i < currentIndex
            ? 'bg-primary text-inverted'
            : i === currentIndex
              ? 'bg-inverted text-inverted'
              : 'bg-elevated text-dimmed'
        "
        aria-hidden="true"
      >
        <UIcon v-if="i < currentIndex" name="i-lucide-check" class="size-3.5" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span :class="i === currentIndex ? 'font-semibold text-highlighted' : 'text-muted'">
        {{ s.label }}
        <span v-if="i < currentIndex" class="sr-only">(terminé)</span>
        <span v-else-if="i === currentIndex" class="sr-only">(étape en cours)</span>
      </span>
      <UIcon v-if="i < STEPS.length - 1" name="i-lucide-chevron-right" class="size-4 text-dimmed" aria-hidden="true" />
    </li>
  </ol>
</template>
