<script setup lang="ts">
const { t } = useVocabulary()

withDefaults(defineProps<{
  title: string
  description?: string
  /** Route to go back to: renders a back button (navigation must stay predictable). */
  backTo?: string
}>(), {
  description: undefined,
  backTo: undefined,
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex items-start gap-2 min-w-0">
        <UButton
          v-if="backTo"
          :to="backTo"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="t('back')"
        />
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold text-highlighted truncate">{{ title }}</h1>
          <p v-if="description" class="text-sm text-muted mt-1">{{ description }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2 shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </div>
</template>
