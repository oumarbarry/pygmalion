<script setup lang="ts">
// Customer groups: who gets which promotion. Flat CRUD, so creation is
// one inline field (same reasoning as collections: wizards are for
// composed operations).
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useCustomersNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ groups: AdminCustomerGroup[] }>(
  '/api/admin/customer-groups',
  { query: { limit: 100 } },
)
const groups = computed(() => data.value?.groups ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const columns = computed(() => [{ key: 'name', label: t('groupNameLabel'), value: (g: AdminCustomerGroup) => g.name }])

const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: '' })

async function create() {
  if (!draft.name.trim()) return
  saving.value = true
  try {
    await fetcher('/api/admin/customer-groups', { method: 'POST', body: { name: draft.name.trim() } })
    draft.name = ''
    creating.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const toDelete = ref<AdminCustomerGroup | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/customer-groups/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('groupsTitle')" :description="t('groupsSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('groupNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; draft.name = ''"
      >
        <UFormField :label="t('groupNameLabel')" name="name" required>
          <UInput v-model="draft.name" size="md" class="w-full" autofocus />
        </UFormField>
      </PygForm>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="t('errorGeneric')"
    >
      <template #actions>
        <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="refresh()" />
      </template>
    </UAlert>

    <PygList
      v-else
      :items="groups"
      :columns="columns"
      :loading="loading"
      :to="(g) => `/admin/customers/groups/${g.id}`"
    >
      <template #cell-name="{ item }">
        <span class="font-semibold text-highlighted">{{ item.name }}</span>
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
          icon="i-lucide-users-round"
          :title="t('groupsEmptyTitle')"
          :description="t('groupsEmptyDescription')"
          :action-label="t('groupNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('groupDeleteTitle')"
      :description="t('groupDeleteBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
