<script setup lang="ts">
// One customer group: rename it, and manage who is in it.
// `GET /api/admin/customer-groups/:id` already hydrates its members, and the
// `{add, remove}` batch route writes both directions.
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const route = useRoute()
const groupId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ group: AdminCustomerGroup & { members: AdminGroupMember[] } }>(
  () => `/api/admin/customer-groups/${groupId.value}`,
)
const group = computed(() => data.value?.group ?? null)
const members = computed(() => group.value?.members ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const form = reactive({ name: '' })
watch(group, (value) => { if (value) form.name = value.name }, { immediate: true })

const saving = ref(false)
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    await fetcher(`/api/admin/customer-groups/${groupId.value}`, { method: 'PATCH', body: { name: form.name.trim() } })
    await refresh()
  } finally {
    saving.value = false
  }
}

const { data: customersData } = useAdminFetch<{ customers: AdminCustomer[] }>('/api/admin/customers', {
  query: { limit: 100 },
})
const addableCustomers = computed(() => {
  const inGroup = new Set(members.value.map((m) => m.id))
  return (customersData.value?.customers ?? []).filter((c) => !inGroup.has(c.id))
})

const customerToAdd = ref('')
async function addMember() {
  if (!customerToAdd.value) return
  await fetcher(`/api/admin/customer-groups/${groupId.value}/members`, {
    method: 'POST',
    body: { add: [customerToAdd.value] },
  })
  customerToAdd.value = ''
  await refresh()
}

const toRemove = ref<AdminGroupMember | null>(null)
const removing = ref(false)
async function confirmRemove() {
  if (!toRemove.value) return
  removing.value = true
  try {
    await fetcher(`/api/admin/customer-groups/${groupId.value}/members`, {
      method: 'POST',
      body: { remove: [toRemove.value.id] },
    })
    toRemove.value = null
    await refresh()
  } finally {
    removing.value = false
  }
}

const columns = computed(() => [
  { key: 'name', label: t('cusColName') },
  { key: 'email', label: t('cusColEmail'), value: (m: AdminGroupMember) => m.email },
])
</script>

<template>
  <PygPage :title="group?.name ?? t('loading')" back-to="/admin/customers/groups">
    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 2" :key="n" class="h-16 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="error || !group"
      icon="i-lucide-users-round"
      :title="t('errorTitle')"
      :description="t('groupNotFound')"
      :action-label="t('groupsTitle')"
      action-to="/admin/customers/groups"
    />

    <template v-else>
      <UCard>
        <PygForm :state="form" :loading="saving" :show-cancel="false" :submit-label="t('save')" @submit="save">
          <UFormField :label="t('groupNameLabel')" name="name" required>
            <UInput v-model="form.name" size="md" class="w-full" />
          </UFormField>
        </PygForm>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted">{{ t('groupMembers') }}</h2>
        </template>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col sm:flex-row sm:items-end gap-3">
            <UFormField :label="t('groupMemberAdd')" name="add-member" class="flex-1">
              <USelect
                v-model="customerToAdd"
                :items="addableCustomers.map((c) => ({ label: c.name ? `${c.name} · ${c.email}` : c.email, value: c.id }))"
                value-key="value"
                size="md"
                class="w-full"
                :placeholder="t('groupMemberAddPlaceholder')"
              />
            </UFormField>
            <UButton icon="i-lucide-plus" size="md" :label="t('add')" :disabled="!customerToAdd" @click="addMember" />
          </div>

          <PygList :items="members" :columns="columns" :to="(m) => `/admin/customers/${m.id}`">
            <template #cell-name="{ item }">
              <span class="font-semibold text-highlighted">{{ item.name || t('cusNoName') }}</span>
            </template>

            <template #actions="{ item }">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                square
                size="md"
                :aria-label="t('remove')"
                @click="toRemove = item"
              />
            </template>

            <template #empty>
              <PygEmptyState
                icon="i-lucide-user-plus"
                :title="t('groupMembersEmptyTitle')"
                :description="t('groupMembersEmptyDescription')"
              />
            </template>
          </PygList>
        </div>
      </UCard>
    </template>

    <PygConfirm
      :open="Boolean(toRemove)"
      :title="t('groupMemberRemoveTitle')"
      :description="t('groupMemberRemoveBody')"
      :confirm-label="t('remove')"
      :loading="removing"
      @update:open="(value) => { if (!value) toRemove = null }"
      @confirm="confirmRemove"
    />
  </PygPage>
</template>
