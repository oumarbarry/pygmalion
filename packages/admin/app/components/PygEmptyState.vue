<script setup lang="ts">
/**
 * Every empty list explains what to do AND offers the
 * button to do it. `actionLabel` is optional only for states that are
 * purely informational (e.g. "nothing to ship yet" on the dashboard, where
 * there is no action to take — the merchant just waits for an order).
 */
withDefaults(defineProps<{
  icon?: string
  title: string
  description: string
  actionLabel?: string
  actionIcon?: string
  actionTo?: string
}>(), {
  icon: 'i-lucide-inbox',
  actionLabel: undefined,
  actionIcon: undefined,
  actionTo: undefined,
})

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <UEmpty :icon="icon" :title="title" :description="description">
    <template v-if="actionLabel" #actions>
      <UButton
        :label="actionLabel"
        :icon="actionIcon"
        :to="actionTo"
        color="primary"
        size="lg"
        @click="actionTo ? undefined : emit('action')"
      />
    </template>
  </UEmpty>
</template>
