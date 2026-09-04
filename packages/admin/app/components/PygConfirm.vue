<script setup lang="ts">
/**
 * Destructive actions must state the consequence in plain
 * language, not just "are you sure?". `description` is where the caller
 * writes that consequence (e.g. "Ce produit disparaîtra de la boutique et
 * ne pourra plus être commandé.").
 *
 * Plain `v-model:open` + events — simpler and more predictable than
 * `useOverlay`'s programmatic promise flow for a component this small.
 */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive tone (red confirm button) — default true, this is PygConfirm. */
  danger?: boolean
  loading?: boolean
}>(), {
  confirmLabel: undefined,
  cancelLabel: undefined,
  danger: true,
  loading: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const { t } = useVocabulary()

function onCancel() {
  emit('update:open', false)
  emit('cancel')
}

function onConfirm() {
  emit('confirm')
}
</script>

<template>
  <UModal :open="props.open" @update:open="(value) => emit('update:open', value)">
    <template #header>
      <h2 class="text-lg font-bold text-highlighted">{{ title }}</h2>
    </template>

    <template #body>
      <p class="text-sm text-muted">{{ description }}</p>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="md"
        block
        class="sm:w-auto"
        :label="cancelLabel ?? t('cancel')"
        :disabled="loading"
        @click="onCancel"
      />
      <UButton
        :color="danger ? 'error' : 'primary'"
        size="md"
        block
        class="sm:w-auto"
        :label="confirmLabel ?? t('confirm')"
        :loading="loading"
        @click="onConfirm"
      />
    </template>
  </UModal>
</template>
