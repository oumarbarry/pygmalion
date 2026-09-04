<script setup lang="ts">
// « Mes produits »: the list every other catalogue screen hangs off.
// Search + filters map 1:1 onto GET /api/admin/products (q, status,
// collection_id[], category_id[]); nothing is filtered client-side.
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const navItems = useCatalogNav()

const search = ref('')
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { debouncedSearch.value = value.trim() }, 250)
})

// `SELECT_NONE`, never '' — an empty SelectItem value crashes Reka UI (see
// utils/select.ts). Here it is the "Tous" row of each filter.
const status = ref<ProductStatus | typeof SELECT_NONE>(SELECT_NONE)
const collectionId = ref(SELECT_NONE)
const categoryId = ref(SELECT_NONE)

const hasFilters = computed(() => Boolean(
  debouncedSearch.value
  || status.value !== SELECT_NONE
  || collectionId.value !== SELECT_NONE
  || categoryId.value !== SELECT_NONE,
))

const query = computed(() => ({
  limit: 50,
  ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
  ...(status.value !== SELECT_NONE ? { status: status.value } : {}),
  ...(collectionId.value !== SELECT_NONE ? { 'collection_id[]': collectionId.value } : {}),
  ...(categoryId.value !== SELECT_NONE ? { 'category_id[]': categoryId.value } : {}),
}))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ products: AdminProduct[] }>('/api/admin/products', { query })
const products = computed(() => data.value?.products ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

// Filter options — the taxonomy a merchant already created.
const { data: collectionData } = useAdminFetch<{ collections: AdminCollection[] }>('/api/admin/collections', {
  query: { limit: 100 },
})
const { data: categoryData } = useAdminFetch<{ categories: AdminCategory[] }>('/api/admin/product-categories', {
  query: { limit: 100 },
})

const statusItems = computed(() => [
  { label: t('filterAny'), value: SELECT_NONE },
  { label: t('statusPublished'), value: 'published' },
  { label: t('statusDraft'), value: 'draft' },
  { label: t('statusProposed'), value: 'proposed' },
  { label: t('statusRejected'), value: 'rejected' },
])
const collectionItems = computed(() => [
  { label: t('filterAny'), value: SELECT_NONE },
  ...(collectionData.value?.collections ?? []).map((c) => ({ label: c.title, value: c.id })),
])
const categoryItems = computed(() => [
  { label: t('filterAny'), value: SELECT_NONE },
  ...(categoryData.value?.categories ?? []).map((c) => ({ label: c.name, value: c.id })),
])

const columns = computed(() => [
  { key: 'thumbnail', label: t('productPhoto'), class: 'w-20', hideLabel: true },
  { key: 'title', label: t('productName'), value: (p: AdminProduct) => p.title, hideLabel: true },
  { key: 'status', label: t('productStatus'), class: 'w-40', hideLabel: true },
])

// --- destructive: delete ----------------------------------------------------
const toDelete = ref<AdminProduct | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await $adminFetch(`/api/admin/products/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}

async function togglePublish(product: AdminProduct) {
  await $adminFetch(`/api/admin/products/${product.id}`, {
    method: 'POST',
    body: { status: product.status === 'published' ? 'draft' : 'published' },
  })
  await refresh()
}

function rowActions(product: AdminProduct) {
  return [[
    { label: t('edit'), icon: 'i-lucide-pencil', to: `/admin/produits/${product.id}` },
    {
      label: product.status === 'published' ? t('unpublishAction') : t('publishAction'),
      icon: product.status === 'published' ? 'i-lucide-eye-off' : 'i-lucide-eye',
      onSelect: () => { void togglePublish(product) },
    },
  ], [
    { label: t('delete'), icon: 'i-lucide-trash-2', onSelect: () => { toDelete.value = product } },
  ]]
}
</script>

<template>
  <PygPage :title="t('sectionProducts')" :description="t('productsSubtitle')">
    <template #actions>
      <UButton to="/admin/produits/nouveau" icon="i-lucide-plus" size="md" :label="t('newProduct')" />
    </template>

    <PygSubNav :items="navItems" />

    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <UFormField :label="t('search')" name="q" class="flex-1 min-w-0">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          size="md"
          class="w-full"
          :placeholder="t('productsSearchPlaceholder')"
        />
      </UFormField>
      <UFormField :label="t('filterStatus')" name="status" class="sm:w-44">
        <USelect v-model="status" :items="statusItems" value-key="value" size="md" class="w-full" />
      </UFormField>
      <UFormField :label="t('filterCollection')" name="collection" class="sm:w-48">
        <USelect v-model="collectionId" :items="collectionItems" value-key="value" size="md" class="w-full" />
      </UFormField>
      <UFormField :label="t('filterCategory')" name="category" class="sm:w-48">
        <USelect v-model="categoryId" :items="categoryItems" value-key="value" size="md" class="w-full" />
      </UFormField>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="error.statusMessage ?? t('errorGeneric')"
    >
      <template #actions>
        <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="refresh()" />
      </template>
    </UAlert>

    <PygList v-else :items="products" :columns="columns" :loading="loading" :to="(p) => `/admin/produits/${p.id}`">
      <template #cell-thumbnail="{ item }">
        <img
          v-if="item.thumbnail"
          :src="item.thumbnail"
          alt=""
          class="size-12 rounded-xl object-cover bg-muted"
          loading="lazy"
        >
        <span v-else class="size-12 rounded-xl bg-muted flex items-center justify-center text-dimmed">
          <UIcon name="i-lucide-image-off" class="size-5" />
        </span>
      </template>

      <template #cell-title="{ item }">
        <span class="font-semibold text-highlighted">{{ item.title }}</span>
        <PygStatus v-if="item.isGiftcard" class="ms-2 align-middle" :label="t('giftcard')" tone="info" icon="i-lucide-gift" />
      </template>

      <template #cell-status="{ item }">
        <PygStatus
          :label="t(productStatusDisplay(item.status).key)"
          :tone="productStatusDisplay(item.status).tone"
          :icon="productStatusDisplay(item.status).icon"
        />
      </template>

      <template #actions="{ item }">
        <UDropdownMenu :items="rowActions(item)">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            square
            size="md"
            :aria-label="t('edit')"
          />
        </UDropdownMenu>
      </template>

      <template #empty>
        <PygEmptyState
          v-if="hasFilters"
          icon="i-lucide-search-x"
          :title="t('noResultsTitle')"
          :description="t('noResultsDescription')"
        />
        <PygEmptyState
          v-else
          icon="i-lucide-shopping-bag"
          :title="t('productsEmptyTitle')"
          :description="t('productsEmptyDescription')"
          :action-label="t('productsEmptyAction')"
          action-icon="i-lucide-plus"
          action-to="/admin/produits/nouveau"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('deleteProductTitle')"
      :description="t('deleteProductBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
