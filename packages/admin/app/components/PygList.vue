<script setup lang="ts" generic="T extends { id: string | number }">
/**
 * Generic responsive list: a real `<table>` on >=sm, stacked cards on
 * mobile. Deliberately not
 * built on `UTable` (TanStack-backed, many more slots to re-theme in
 * unstyled mode) — plain semantic HTML gives full control for two cheap
 * layouts and stays inside Reka UI's job (interactive primitives), not a
 * data-grid's.
 *
 * Empty state is NOT rendered here — pass a `#empty` slot (PygEmptyState)
 * so every list keeps its own pedagogical copy (explanatory empty states).
 */
export interface PygListColumn<T> {
  key: string
  label: string
  class?: string
  /**
   * Drop the label on the mobile card. For a column whose cell speaks for
   * itself (a photo, a status badge) the label is pure noise stacked above
   * it, and it pushed the product name to third place on a phone.
   */
  hideLabel?: boolean
  /** Cell value when no `#cell-<key>` slot is provided for this column. */
  value?: (item: T) => string | number | null | undefined
}

type RouteTarget = string | { name: string; params?: Record<string, string> }

withDefaults(defineProps<{
  items: T[]
  columns: PygListColumn<T>[]
  loading?: boolean
  /** Row -> route: makes each row/card a tap target (>=44px, usable on a phone). */
  to?: (item: T) => RouteTarget
}>(), {
  loading: false,
  to: undefined,
})
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-2xl" />
    </div>

    <template v-else-if="items.length">
      <!-- Desktop / tablet: real table -->
      <div class="hidden sm:block overflow-x-auto rounded-2xl border border-default">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted">
            <tr>
              <th v-for="col in columns" :key="col.key" class="px-4 py-3 font-semibold text-muted" :class="col.class">
                {{ col.label }}
              </th>
              <th v-if="$slots.actions" class="px-4 py-3 w-12">
                <span class="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="item in items" :key="item.id" class="hover:bg-muted/60 transition-colors">
              <td v-for="col in columns" :key="col.key" class="px-4 py-3 align-middle" :class="col.class">
                <NuxtLink v-if="to" :to="to(item)" class="block min-h-6">
                  <slot :name="`cell-${col.key}`" :item="item">{{ col.value?.(item) ?? '—' }}</slot>
                </NuxtLink>
                <slot v-else :name="`cell-${col.key}`" :item="item">{{ col.value?.(item) ?? '—' }}</slot>
              </td>
              <td v-if="$slots.actions" class="px-2 py-3 text-right">
                <slot name="actions" :item="item" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile: stacked cards, whole card tappable via a stretched link -->
      <ul class="flex flex-col gap-3 sm:hidden">
        <li v-for="item in items" :key="item.id" class="relative rounded-2xl border border-default bg-default p-4">
          <NuxtLink
            v-if="to"
            :to="to(item)"
            class="absolute inset-0 rounded-2xl"
            :aria-label="String(columns[0]?.value?.(item) ?? columns[0]?.label ?? '')"
          />
          <div class="relative flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1 flex flex-col gap-2 pointer-events-none">
              <div v-for="col in columns" :key="col.key" class="min-w-0">
                <p v-if="!col.hideLabel" class="text-xs text-dimmed">{{ col.label }}</p>
                <div class="text-sm text-default truncate">
                  <slot :name="`cell-${col.key}`" :item="item">{{ col.value?.(item) ?? '—' }}</slot>
                </div>
              </div>
            </div>
            <div v-if="$slots.actions" class="relative shrink-0">
              <slot name="actions" :item="item" />
            </div>
          </div>
        </li>
      </ul>
    </template>

    <slot v-else name="empty" />
  </div>
</template>
