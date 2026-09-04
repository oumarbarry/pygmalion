<script setup lang="ts">
// Collections: hand-picked sets of products. Flat CRUD, so the creation
// is a single inline form rather than a wizard (wizards are for
// *composed* operations; one field doesn't need six screens).
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const navItems = useCatalogNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ collections: AdminCollection[] }>(
  '/api/admin/collections',
  { query: { limit: 100 } },
)
const collections = computed(() => data.value?.collections ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const columns = computed(() => [{ key: 'title', label: t('collectionTitleLabel'), value: (c: AdminCollection) => c.title }])

const creating = ref(false)
const saving = ref(false)
const draft = reactive({ title: '' })

async function create() {
  if (!draft.title.trim()) return
  saving.value = true
  try {
    await $adminFetch('/api/admin/collections', { method: 'POST', body: { title: draft.title.trim() } })
    draft.title = ''
    creating.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const toDelete = ref<AdminCollection | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await $adminFetch(`/api/admin/collections/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('collections')" :description="t('collectionsSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('newCollection')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; draft.title = ''"
      >
        <UFormField :label="t('collectionTitleLabel')" name="title" required>
          <UInput v-model="draft.title" size="md" class="w-full" autofocus />
        </UFormField>
      </PygForm>
    </UCard>

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

    <PygList
      v-else
      :items="collections"
      :columns="columns"
      :loading="loading"
      :to="(c) => `/admin/produits/collections/${c.id}`"
    >
      <template #cell-title="{ item }">
        <span class="font-semibold text-highlighted">{{ item.title }}</span>
      </template>

      <template #actions="{ item }">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          square
          size="md"
          :aria-label="t('delete')"
          @click="toDelete = item"
        />
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-layers"
          :title="t('collectionsEmptyTitle')"
          :description="t('collectionsEmptyDescription')"
          :action-label="t('newCollection')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('deleteCollectionTitle')"
      :description="t('deleteCollectionBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
