<script setup lang="ts">
/**
 * « Notifications techniques » (webhook endpoints). Two readers share
 * this screen and neither is sacrificed: the merchant gets plain sentences
 * ("prévenir automatiquement un autre logiciel"), the developer wiring the
 * other end gets the raw URL, the exact event names and the signature scheme.
 *
 * The signing secret is returned by `POST /admin/webhook-endpoints` and by
 * rotate-secret only — every later read masks it — hence the one-shot panel.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ webhookEndpoints: AdminWebhookEndpoint[] }>(
  '/api/admin/webhook-endpoints',
)
const endpoints = computed(() => data.value?.webhookEndpoints ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const columns = computed(() => [
  { key: 'url', label: t('setWebhookColUrl') },
  { key: 'events', label: t('setWebhookColEvents') },
  { key: 'state', label: t('labelStatus') },
])

// --- create ------------------------------------------------------------------
const creating = ref(false)
const saving = ref(false)
const draft = reactive({ url: '', description: '', events: ['*'] as string[] })
const revealed = ref<string | null>(null)

function resetDraft() {
  draft.url = ''
  draft.description = ''
  draft.events = ['*']
}

async function create() {
  if (!draft.url.trim() || !draft.events.length) return
  saving.value = true
  try {
    const { webhookEndpoint } = await fetcher<{ webhookEndpoint: AdminWebhookEndpoint }>(
      '/api/admin/webhook-endpoints',
      {
        method: 'POST',
        body: {
          url: draft.url.trim(),
          events: draft.events,
          description: draft.description.trim() || null,
        },
      },
    )
    revealed.value = webhookEndpoint.secret ?? null
    creating.value = false
    resetDraft()
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- delete ------------------------------------------------------------------
const toDelete = ref<AdminWebhookEndpoint | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/webhook-endpoints/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setWebhooksTitle')" :description="t('setWebhooksSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setWebhookNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <SettingsOnceSecret
      v-if="revealed"
      :title="t('setSecretOnceTitle')"
      :description="t('setSecretOnceDescription')"
      :value="revealed"
      @close="revealed = null"
    />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; resetDraft()"
      >
        <UFormField :label="t('setWebhookUrl')" :description="t('setWebhookUrlHint')" name="url" required>
          <UInput v-model="draft.url" type="url" size="md" class="w-full sm:max-w-xl font-mono" autofocus />
        </UFormField>

        <UFormField :label="t('setWebhookDescription')" name="description">
          <UInput v-model="draft.description" size="md" class="w-full sm:max-w-xl" />
        </UFormField>

        <UFormField :label="t('setWebhookEvents')" name="events" required>
          <SettingsEventsPicker v-model="draft.events" />
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
      :items="endpoints"
      :columns="columns"
      :loading="loading"
      :to="(e) => `/admin/settings/webhooks/${e.id}`"
    >
      <template #cell-url="{ item }">
        <span class="font-mono text-sm text-highlighted break-all">{{ item.url }}</span>
        <span v-if="item.description" class="block text-xs text-muted truncate">{{ item.description }}</span>
      </template>

      <template #cell-events="{ item }">
        <span class="text-sm text-muted">
          {{ item.events.includes('*') ? t('setWebhookAllEvents') : item.events.length }}
        </span>
      </template>

      <template #cell-state="{ item }">
        <PygStatus
          :tone="item.active ? 'success' : 'neutral'"
          :label="item.active ? t('setActive') : t('setInactive')"
          :icon="item.active ? 'i-lucide-circle-check' : 'i-lucide-circle-pause'"
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
          icon="i-lucide-webhook"
          :title="t('setWebhooksEmptyTitle')"
          :description="t('setWebhooksEmptyDescription')"
          :action-label="t('setWebhookNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('setDeleteWebhookTitle')"
      :description="t('setDeleteWebhookBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
