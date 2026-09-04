<script setup lang="ts">
/**
 * Canaux de vente. « Ouvert / Fermé » rather than the stored
 * `isDisabled`: a merchant reasons about what is open, not about what is
 * not-disabled.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ salesChannels: AdminSalesChannelDetail[] }>(
  '/api/admin/sales-channels',
  { query: { limit: 100 } },
)
const channels = computed(() => data.value?.salesChannels ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const columns = computed(() => [
  { key: 'name', label: t('setChannelName'), value: (c: AdminSalesChannelDetail) => c.name },
  { key: 'state', label: t('labelStatus') },
])

const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: '', description: '' })

async function create() {
  if (!draft.name.trim()) return
  saving.value = true
  try {
    await fetcher('/api/admin/sales-channels', {
      method: 'POST',
      body: { name: draft.name.trim(), description: draft.description.trim() || null },
    })
    creating.value = false
    draft.name = ''
    draft.description = ''
    await refresh()
  } finally {
    saving.value = false
  }
}

const toDelete = ref<AdminSalesChannelDetail | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/sales-channels/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setChannelsTitle')" :description="t('setChannelsSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setChannelNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; draft.name = ''; draft.description = ''"
      >
        <UFormField :label="t('setChannelName')" name="name" required>
          <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" autofocus />
        </UFormField>
        <UFormField :label="t('setChannelDescription')" name="description">
          <UTextarea v-model="draft.description" :rows="2" class="w-full sm:max-w-md" />
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
      :items="channels"
      :columns="columns"
      :loading="loading"
      :to="(c) => `/admin/reglages/canaux/${c.id}`"
    >
      <template #cell-name="{ item }">
        <span class="font-semibold text-highlighted">{{ item.name }}</span>
        <span v-if="item.description" class="block text-xs text-muted truncate">{{ item.description }}</span>
      </template>

      <template #cell-state="{ item }">
        <PygStatus
          :tone="item.isDisabled ? 'neutral' : 'success'"
          :label="item.isDisabled ? t('setChannelClosed') : t('setChannelOpen')"
          :icon="item.isDisabled ? 'i-lucide-circle-pause' : 'i-lucide-circle-check'"
        />
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
          icon="i-lucide-radio"
          :title="t('setChannelsEmptyTitle')"
          :description="t('setChannelsEmptyDescription')"
          :action-label="t('setChannelNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('setDeleteChannelTitle')"
      :description="t('setDeleteChannelBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
