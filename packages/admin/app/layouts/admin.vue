<script setup lang="ts">
/**
 * The shell: sidebar with the 6 merchant task sections (never the
 * technical domains directly), header with an omnipresent global search
 * + user menu. Mobile-first: sidebar is an off-canvas
 * drawer under `lg`, every tap target here is >=44px.
 */
const { t } = useVocabulary()
const session = useAdminSession()
const route = useRoute()
const { $adminFetch } = useNuxtApp()

const navItems = computed(() => [
  { label: t('sectionToday'), to: '/admin', icon: 'i-lucide-sparkles' },
  { label: t('sectionOrders'), to: '/admin/commandes', icon: 'i-lucide-package' },
  { label: t('sectionProducts'), to: '/admin/produits', icon: 'i-lucide-shopping-bag' },
  { label: t('sectionCustomers'), to: '/admin/clients', icon: 'i-lucide-users' },
  { label: t('sectionPromotions'), to: '/admin/promotions', icon: 'i-lucide-tag' },
  { label: t('sectionSettings'), to: '/admin/reglages', icon: 'i-lucide-settings' },
])

function isActive(to: string) {
  return to === '/admin' ? route.path === '/admin' : route.path.startsWith(to)
}

const mobileNavOpen = ref(false)
watch(() => route.fullPath, () => { mobileNavOpen.value = false })

const userMenuItems = computed(() => [[
  { label: t('signOut'), icon: 'i-lucide-log-out', onSelect: () => signOutAdmin() },
]])

const initials = computed(() => {
  const name = session.value.data?.user?.name ?? session.value.data?.user?.email ?? ''
  return name.trim().slice(0, 2).toUpperCase() || '??'
})

// Global search: best-effort against the one list endpoint
// that exists today (products). Extend once orders/customers have GET list
// routes: push more sections into `results`.
const searchQuery = ref('')
const searchResults = ref<{ id: string; title: string }[]>([])
const searchOpen = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim()) {
    searchResults.value = []
    searchOpen.value = false
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      // `$adminFetch` (plugins/admin-api.ts), never a bare `$fetch` — the
      // 401-to-sign-in bounce belongs on every /api/admin/** call.
      const res = await $adminFetch<{ products: { id: string; title: string }[] }>('/api/admin/products', {
        query: { q, limit: 5 },
      })
      searchResults.value = res.products.map((p) => ({ id: p.id, title: p.title }))
      searchOpen.value = true
    } catch {
      searchResults.value = []
    }
  }, 250)
})
</script>

<template>
  <div class="min-h-dvh flex bg-default text-default">
    <!-- Mobile off-canvas backdrop -->
    <button
      v-if="mobileNavOpen"
      type="button"
      class="fixed inset-0 z-30 bg-neutral-950/50 lg:hidden"
      :aria-label="t('cancel')"
      @click="mobileNavOpen = false"
    />

    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 w-72 shrink-0 flex flex-col gap-1 border-r border-default bg-default p-3 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0"
      :class="mobileNavOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center gap-2 px-2 py-3">
        <div class="size-9 rounded-xl bg-primary flex items-center justify-center text-inverted font-black">P</div>
        <span class="font-bold text-highlighted">Pygmalion</span>
      </div>

      <nav class="flex flex-col gap-1 mt-2">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="pyg-tap-target flex items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors"
          :class="isActive(item.to) ? 'bg-primary/10 text-primary' : 'text-default hover:bg-muted'"
        >
          <UIcon :name="item.icon" class="size-5 shrink-0" />
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <!-- Main column -->
    <div class="flex-1 flex flex-col min-w-0 lg:pl-0">
      <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-default bg-default/95 backdrop-blur px-3 sm:px-6 h-16 shrink-0">
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          square
          size="md"
          class="lg:hidden"
          :aria-label="t('openMenu')"
          @click="mobileNavOpen = true"
        />

        <div class="relative flex-1 max-w-xl">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            size="md"
            :placeholder="t('searchPlaceholder')"
            class="w-full"
            @focus="searchOpen = searchResults.length > 0"
          />
          <div
            v-if="searchOpen"
            class="absolute inset-x-0 top-full mt-2 rounded-xl border border-default bg-default shadow-lg overflow-hidden z-30"
          >
            <ul v-if="searchResults.length">
              <li v-for="r in searchResults" :key="r.id">
                <NuxtLink
                  :to="`/admin/produits/${r.id}`"
                  class="flex items-center gap-2 px-3.5 min-h-11 text-sm hover:bg-muted"
                  @click="searchOpen = false"
                >
                  <UIcon name="i-lucide-shopping-bag" class="size-4 text-dimmed shrink-0" />
                  <span class="truncate">{{ r.title }}</span>
                </NuxtLink>
              </li>
            </ul>
            <p v-else class="px-3.5 py-3 text-sm text-muted">{{ t('searchNoResults') }}</p>
          </div>
        </div>

        <!-- `ms-auto`: the search caps at max-w-xl, so without it the user
             menu sat glued to the search box with the rest of the header
             empty to its right. -->
        <UDropdownMenu :items="userMenuItems" class="ms-auto">
          <UButton color="neutral" variant="ghost" square size="md" class="pyg-tap-target">
            <span class="size-8 rounded-full bg-muted text-default font-bold flex items-center justify-center text-xs">
              {{ initials }}
            </span>
          </UButton>
        </UDropdownMenu>
      </header>

      <!-- `max-w-[100rem]`: content stops stretching on an ultrawide screen
           instead of throwing a form field across 2000px. -->
      <main class="flex-1 min-w-0 w-full max-w-[100rem] mx-auto p-4 sm:p-6 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
