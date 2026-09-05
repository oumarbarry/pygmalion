<script setup lang="ts">
// One collection: rename it, and manage which products belong to it.
// Membership is read back via `GET /api/admin/products?collection_id[]=`, and
// written with the `{add, remove}` batch route.
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const route = useRoute()
const collectionId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ collection: AdminCollection }>(
  () => `/api/admin/collections/${collectionId.value}`,
)
const collection = computed(() => data.value?.collection ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const { data: memberData, refresh: refreshMembers } = useAdminFetch<{ products: AdminProduct[] }>(
  '/api/admin/products',
  { query: computed(() => ({ 'collection_id[]': collectionId.value, limit: 100 })) },
)
const members = computed(() => memberData.value?.products ?? [])

const { data: allProductsData } = useAdminFetch<{ products: AdminProduct[] }>('/api/admin/products', {
  query: { limit: 100 },
})
const addableProducts = computed(() => {
  const memberIds = new Set(members.value.map((p) => p.id))
  return (allProductsData.value?.products ?? []).filter((p) => !memberIds.has(p.id))
})

const form = reactive({ title: '' })
watch(collection, (value) => { if (value) form.title = value.title }, { immediate: true })

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $adminFetch(`/api/admin/collections/${collectionId.value}`, {
      method: 'POST',
      body: { title: form.title.trim() },
    })
    await refresh()
  } finally {
    saving.value = false
  }
}

const productToAdd = ref('')
async function addProduct() {
  if (!productToAdd.value) return
  await $adminFetch(`/api/admin/collections/${collectionId.value}/products`, {
    method: 'POST',
    body: { add: [productToAdd.value] },
  })
  productToAdd.value = ''
  await refreshMembers()
}

async function removeProduct(product: AdminProduct) {
  await $adminFetch(`/api/admin/collections/${collectionId.value}/products`, {
    method: 'POST',
    body: { remove: [product.id] },
  })
  await refreshMembers()
}

const columns = computed(() => [
  { key: 'thumbnail', label: t('productPhoto'), class: 'w-20', hideLabel: true },
  { key: 'title', label: t('productName'), value: (p: AdminProduct) => p.title, hideLabel: true },
])
</script>

<template>
  <PygPage :title="collection?.title ?? t('loading')" back-to="/admin/products/collections">
    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 2" :key="n" class="h-16 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="error || !collection"
      icon="i-lucide-layers"
      :title="t('errorTitle')"
      :description="t('errorGeneric')"
      :action-label="t('collections')"
      action-to="/admin/products/collections"
    />

    <template v-else>
      <UCard>
        <PygForm :state="form" :loading="saving" :show-cancel="false" :submit-label="t('save')" @submit="save">
          <UFormField :label="t('collectionTitleLabel')" name="title" required>
            <UInput v-model="form.title" size="md" class="w-full" />
          </UFormField>
        </PygForm>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted">{{ t('collectionProducts') }}</h2>
        </template>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col sm:flex-row sm:items-end gap-3">
            <UFormField :label="t('addProductsLabel')" name="add-product" class="flex-1">
              <USelect
                v-model="productToAdd"
                :items="addableProducts.map((p) => ({ label: p.title, value: p.id }))"
                value-key="value"
                size="md"
                class="w-full"
                :placeholder="t('addProductsPlaceholder')"
              />
            </UFormField>
            <UButton icon="i-lucide-plus" size="md" :label="t('add')" :disabled="!productToAdd" @click="addProduct" />
          </div>

          <PygList :items="members" :columns="columns" :to="(p) => `/admin/products/${p.id}`">
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
            </template>

            <template #actions="{ item }">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                square
                size="md"
                :aria-label="t('remove')"
                @click="removeProduct(item)"
              />
            </template>

            <template #empty>
              <PygEmptyState
                icon="i-lucide-package-open"
                :title="t('collectionProductsEmptyTitle')"
                :description="t('collectionProductsEmptyDescription')"
              />
            </template>
          </PygList>
        </div>
      </UCard>
    </template>
  </PygPage>
</template>
