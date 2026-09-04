<script setup lang="ts">
/**
 * A credential the server returns exactly once (api key, webhook signing
 * secret, invite link). One component for the three, because the rule they
 * enforce is the same: show it, make it trivially copyable, say plainly that
 * it will never be shown again.
 *
 * The value stays selectable text, so a browser without the async clipboard
 * API (or a denied permission) still lets the merchant copy it by hand.
 */
defineProps<{ title: string; description: string; value: string; copyLabel?: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useVocabulary()
const copied = ref(false)

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard denied/unavailable — the value is on screen and selectable.
  }
}
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <UIcon name="i-lucide-shield-alert" class="size-6 shrink-0 text-warning" />
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-highlighted">{{ title }}</h2>
            <p class="text-sm text-muted mt-1">{{ description }}</p>
          </div>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="t('setClose')"
          @click="emit('close')"
        />
      </div>

      <p class="rounded-xl border border-default bg-muted px-4 py-3 font-mono text-sm break-all select-all">
        {{ value }}
      </p>

      <div class="flex justify-end">
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :color="copied ? 'success' : 'primary'"
          size="md"
          block
          class="sm:w-auto"
          :label="copied ? t('setCopied') : (copyLabel ?? t('setCopy'))"
          @click="copy(value)"
        />
      </div>
    </div>
  </UCard>
</template>
