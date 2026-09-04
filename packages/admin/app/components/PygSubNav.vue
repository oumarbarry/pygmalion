<script setup lang="ts">
/**
 * Second-level navigation inside one of the 6 task sections. The sidebar stays
 * at exactly 6 items; everything a section collapses
 * (products / collections / categories / tags / stock / prices) is reachable
 * from here instead of growing the sidebar.
 *
 * Plain scrollable `<NuxtLink>` row, same reasoning as the sidebar:
 * two cheap layouts don't justify re-theming `UNavigationMenu` unstyled.
 */
export interface PygSubNavItem {
  label: string
  to: string
  icon: string
  /** Active only on an exact path match (index routes that prefix siblings). */
  exact?: boolean
}

defineProps<{ items: PygSubNavItem[] }>()

const route = useRoute()

function isActive(item: PygSubNavItem) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}
</script>

<template>
  <nav class="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto border-b border-default">
    <!-- Scrolls on a phone, wraps from `lg` up: the 9-entry Réglages bar was
         cut off at the viewport edge on a laptop with no hint that it
         scrolled. -->
    <ul class="flex items-center gap-1 min-w-max lg:min-w-0 lg:flex-wrap">
      <li v-for="item in items" :key="item.to">
        <NuxtLink
          :to="item.to"
          class="pyg-tap-target inline-flex items-center gap-2 px-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors"
          :class="isActive(item) ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-default'"
          :aria-current="isActive(item) ? 'page' : undefined"
        >
          <UIcon :name="item.icon" class="size-4 shrink-0" />
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
