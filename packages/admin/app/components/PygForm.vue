<script setup lang="ts">
/**
 * Thin wrapper around UForm: consistent error banner + submit/cancel row
 * so no screen hand-rolls its own button layout.
 * `schema` accepts any Standard Schema (zod, etc.) — optional, screens
 * without validation can omit it.
 */
const props = withDefaults(defineProps<{
  state: Record<string, unknown>
  schema?: unknown
  loading?: boolean
  error?: string | null
  submitLabel?: string
  cancelLabel?: string
  showCancel?: boolean
}>(), {
  schema: undefined,
  loading: false,
  error: null,
  submitLabel: undefined,
  cancelLabel: undefined,
  showCancel: true,
})

const emit = defineEmits<{
  submit: [data: Record<string, unknown>]
  cancel: []
}>()

const { t } = useVocabulary()
</script>

<template>
  <UForm :state="(props.state as never)" :schema="(props.schema as never)" class="flex flex-col gap-5" @submit="(event) => emit('submit', event.data as Record<string, unknown>)">
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="t('errorTitle')"
      :description="error"
      icon="i-lucide-circle-alert"
    />

    <slot />

    <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
      <UButton
        v-if="showCancel"
        color="neutral"
        variant="outline"
        size="md"
        block
        class="sm:w-auto"
        :label="cancelLabel ?? t('cancel')"
        @click="emit('cancel')"
      />
      <UButton
        type="submit"
        color="primary"
        size="md"
        block
        class="sm:w-auto"
        :label="submitLabel ?? t('save')"
        :loading="loading"
      />
    </div>
  </UForm>
</template>
