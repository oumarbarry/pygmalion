<script setup lang="ts">
const emit = defineEmits<{ signOut: [] }>()
const { t } = useShopText()

// `/account` is the parent of every other route here, so it needs the EXACT
// match or it highlights on all of them; the others match by prefix so an
// order's detail page still lights up "My orders".
const links = [
  { to: '/account', label: 'accountTitle', icon: 'i-lucide-user', exact: true },
  { to: '/account/orders', label: 'accountOrders', icon: 'i-lucide-package', exact: false },
  { to: '/account/addresses', label: 'accountAddresses', icon: 'i-lucide-map-pin', exact: false },
] as const
const ACTIVE = 'bg-muted text-highlighted'
</script>

<template>
  <!-- `flex-wrap`, not `overflow-x-auto`: at 390px the four entries don't fit on
       one line, and a scrolled-away active item is an item the visitor can't
       see they're on. Two rows, everything visible, no scroll affordance to
       invent. -->
  <nav class="flex flex-row flex-wrap gap-1 sm:flex-col sm:flex-nowrap" :aria-label="t('accountTitle')">
    <NuxtLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-muted hover:text-highlighted"
      :active-class="l.exact ? '' : ACTIVE"
      :exact-active-class="ACTIVE"
    >
      <UIcon :name="l.icon" class="size-4" />
      {{ t(l.label) }}
    </NuxtLink>
    <button
      type="button"
      class="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-muted hover:text-highlighted"
      data-testid="sign-out"
      @click="emit('signOut')"
    >
      <UIcon name="i-lucide-log-out" class="size-4" />
      {{ t('accountSignOut') }}
    </button>
  </nav>
</template>
