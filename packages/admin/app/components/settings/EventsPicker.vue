<script setup lang="ts">
/**
 * Which events a webhook endpoint subscribes to. `'*'` (everything) is the
 * default and the only thing a non-technical merchant ever sees; turning the
 * switch off reveals the ~100 real event names, grouped by domain.
 *
 * The groups are `<details>` — a native disclosure needs no theme entry, no
 * JS state and is keyboard/screen-reader correct out of the box (an
 * `UAccordion` would have to be themed from scratch in unstyled mode).
 */
const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const { t } = useVocabulary()

const all = computed(() => props.modelValue.includes('*'))

function setAll(next: boolean) {
  emit('update:modelValue', next ? ['*'] : [])
}

function toggle(event: string, next: boolean) {
  const set = new Set(props.modelValue.filter((e) => e !== '*'))
  if (next) set.add(event)
  else set.delete(event)
  emit('update:modelValue', [...set])
}

function groupState(events: string[]): boolean {
  return events.every((e) => props.modelValue.includes(e))
}

function toggleGroup(events: string[], next: boolean) {
  const set = new Set(props.modelValue.filter((e) => e !== '*'))
  for (const e of events) {
    if (next) set.add(e)
    else set.delete(e)
  }
  emit('update:modelValue', [...set])
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <USwitch
      :model-value="all"
      :label="t('setWebhookAllEvents')"
      :description="t('setWebhookAllEventsHint')"
      @update:model-value="(next) => setAll(next === true)"
    />

    <div v-if="!all" class="flex flex-col gap-2">
      <p class="text-sm font-semibold text-highlighted">{{ t('setWebhookPickEvents') }}</p>

      <details v-for="group in DOMAIN_EVENT_GROUPS" :key="group.key" class="rounded-xl border border-default">
        <summary class="pyg-tap-target flex items-center px-4 text-sm font-semibold text-default cursor-pointer">
          {{ t(group.key) }}
        </summary>
        <div class="flex flex-col gap-1 border-t border-default px-4 py-3">
          <UCheckbox
            :model-value="groupState(group.events)"
            :label="t('all')"
            class="pyg-tap-target"
            @update:model-value="(next) => toggleGroup(group.events, next === true)"
          />
          <UCheckbox
            v-for="event in group.events"
            :key="event"
            :model-value="modelValue.includes(event)"
            :label="event"
            class="pyg-tap-target font-mono"
            @update:model-value="(next) => toggle(event, next === true)"
          />
        </div>
      </details>

      <p v-if="!modelValue.length" class="text-sm text-error">{{ t('setWebhookEventsRequired') }}</p>
    </div>
  </div>
</template>
