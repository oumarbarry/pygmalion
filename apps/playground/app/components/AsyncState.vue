<script setup lang="ts">
/**
 * The three states every page owes the visitor, in one place: loading, failed,
 * empty. Renders its default slot only once there is something real to show,
 * so a page can't accidentally ship a blank screen.
 */
withDefaults(
  defineProps<{
    pending?: boolean
    error?: unknown
    empty?: boolean
    /** Skeleton block count while pending — match the shape of what's coming. */
    skeleton?: number
    emptyTitle?: string
    emptyMessage?: string
    emptyIcon?: string
  }>(),
  {
    skeleton: 0,
    emptyTitle: 'Rien à afficher',
    emptyMessage: '',
    emptyIcon: 'i-lucide-package-open',
  },
)

const emit = defineEmits<{ retry: [] }>()

const message = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Une erreur est survenue.'
</script>

<template>
  <div v-if="pending" data-testid="state-loading" role="status" aria-live="polite">
    <span class="sr-only">Chargement…</span>
    <div v-if="skeleton" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in skeleton" :key="i" class="animate-pulse">
        <div class="aspect-4/5 w-full rounded-xl bg-elevated" />
        <div class="mt-3 h-4 w-2/3 rounded bg-elevated" />
        <div class="mt-2 h-4 w-1/4 rounded bg-elevated" />
      </div>
    </div>
    <div v-else class="flex items-center gap-3 py-10 text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      <span class="text-sm">Chargement…</span>
    </div>
  </div>

  <div
    v-else-if="error"
    data-testid="state-error"
    role="alert"
    class="rounded-xl border border-error/30 bg-error/5 px-5 py-6"
  >
    <p class="flex items-center gap-2 font-semibold text-highlighted">
      <UIcon name="i-lucide-triangle-alert" class="size-5 text-error" />
      Ça n'a pas fonctionné
    </p>
    <p class="mt-1.5 text-sm text-muted">{{ message(error) }}</p>
    <UButton class="mt-4" size="sm" color="neutral" variant="outline" label="Réessayer" @click="emit('retry')" />
  </div>

  <div v-else-if="empty" data-testid="state-empty" class="rounded-xl border border-dashed border-default px-6 py-14 text-center">
    <UIcon :name="emptyIcon" class="mx-auto size-8 text-dimmed" />
    <p class="mt-4 font-semibold text-highlighted">{{ emptyTitle }}</p>
    <p v-if="emptyMessage" class="mx-auto mt-1.5 max-w-sm text-sm text-muted">{{ emptyMessage }}</p>
    <slot name="empty-action" />
  </div>

  <slot v-else />
</template>
