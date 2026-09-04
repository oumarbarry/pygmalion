<script setup lang="ts">
/**
 * Clés boutique (`api-keys`). "Publishable key" and
 * "secret key" never appear: a merchant picks between « clé boutique (site
 * web) » and « clé serveur (logiciel) », and each choice carries the sentence
 * that tells them where it may safely live.
 *
 * The raw key is returned only by `POST /admin/api-keys`; every later read is
 * masked (`start` is the visible prefix). Hence the one-shot panel.
 *
 * Revocation is one-way by design (the row is kept, `enabled: false`), so it
 * goes through PygConfirm with that consequence written out.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ apiKeys: AdminApiKey[] }>('/api/admin/api-keys')
const apiKeys = computed(() => data.value?.apiKeys ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const { data: channelData } = useAdminFetch<{ salesChannels: AdminSalesChannelDetail[] }>('/api/admin/sales-channels', {
  query: { limit: 100 },
})
const channels = computed(() => channelData.value?.salesChannels ?? [])

const columns = computed(() => [
  { key: 'name', label: t('setKeyColName') },
  { key: 'kind', label: t('setKeyColKind') },
  { key: 'state', label: t('setKeyColStatus') },
])

function isStoreKey(key: AdminApiKey): boolean {
  return key.prefix === 'pk_'
}

// --- create ------------------------------------------------------------------
const creating = ref(false)
const saving = ref(false)
const draft = reactive({ type: 'publishable' as 'publishable' | 'secret', name: '', salesChannelIds: [] as string[] })
const revealed = ref<string | null>(null)

const typeItems = computed(() => [
  { label: t('setKeyKindStore'), value: 'publishable' },
  { label: t('setKeyKindServer'), value: 'secret' },
])

function toggleChannel(id: string, next: boolean) {
  const set = new Set(draft.salesChannelIds)
  if (next) set.add(id)
  else set.delete(id)
  draft.salesChannelIds = [...set]
}

function resetDraft() {
  draft.type = 'publishable'
  draft.name = ''
  draft.salesChannelIds = []
}

async function create() {
  if (!draft.name.trim()) return
  saving.value = true
  try {
    const { apiKey } = await fetcher<{ apiKey: AdminApiKey }>('/api/admin/api-keys', {
      method: 'POST',
      body: {
        type: draft.type,
        name: draft.name.trim(),
        ...(draft.type === 'publishable' ? { salesChannelIds: draft.salesChannelIds } : {}),
      },
    })
    revealed.value = apiKey.key ?? null
    creating.value = false
    resetDraft()
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- revoke ------------------------------------------------------------------
const toRevoke = ref<AdminApiKey | null>(null)
const revoking = ref(false)

async function confirmRevoke() {
  if (!toRevoke.value) return
  revoking.value = true
  try {
    await fetcher(`/api/admin/api-keys/${toRevoke.value.id}/revoke`, { method: 'POST' })
    toRevoke.value = null
    await refresh()
  } finally {
    revoking.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setKeysTitle')" :description="t('setKeysSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setKeyNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <SettingsOnceSecret
      v-if="revealed"
      :title="t('setKeyOnceTitle')"
      :description="t('setKeyOnceDescription')"
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
        <UFormField :label="t('setKeyKindQuestion')" name="type" required>
          <USelect v-model="draft.type" :items="typeItems" value-key="value" size="md" class="w-full sm:max-w-md" />
        </UFormField>

        <UAlert
          color="info"
          variant="soft"
          :icon="draft.type === 'publishable' ? 'i-lucide-globe' : 'i-lucide-server'"
          :description="draft.type === 'publishable' ? t('setKeyKindStoreHint') : t('setKeyKindServerHint')"
        />

        <UFormField :label="t('setKeyName')" :description="t('setKeyNameHint')" name="name" required>
          <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" autofocus />
        </UFormField>

        <UFormField
          v-if="draft.type === 'publishable' && channels.length"
          :label="t('setKeyChannels')"
          :description="t('setKeyChannelsHint')"
          name="salesChannelIds"
        >
          <ul class="flex flex-col gap-1">
            <li v-for="channel in channels" :key="channel.id">
              <UCheckbox
                :model-value="draft.salesChannelIds.includes(channel.id)"
                :label="channel.name"
                class="pyg-tap-target"
                @update:model-value="(next) => toggleChannel(channel.id, next === true)"
              />
            </li>
          </ul>
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

    <PygList v-else :items="apiKeys" :columns="columns" :loading="loading">
      <template #cell-name="{ item }">
        <span class="font-semibold text-highlighted">{{ item.name || t('setKeyUnnamed') }}</span>
        <span v-if="item.start" class="block font-mono text-xs text-muted">{{ item.start }}…</span>
      </template>

      <template #cell-kind="{ item }">
        <PygStatus
          tone="neutral"
          :label="isStoreKey(item) ? t('setKeyKindStore') : t('setKeyKindServer')"
          :icon="isStoreKey(item) ? 'i-lucide-globe' : 'i-lucide-server'"
        />
      </template>

      <template #cell-state="{ item }">
        <PygStatus
          :tone="item.enabled ? 'success' : 'neutral'"
          :label="item.enabled ? t('setKeyStatusActive') : t('setKeyStatusRevoked')"
          :icon="item.enabled ? 'i-lucide-circle-check' : 'i-lucide-circle-slash'"
        />
      </template>

      <template #actions="{ item }">
        <UButton
          v-if="item.enabled"
          icon="i-lucide-circle-slash"
          color="error"
          variant="ghost"
          square
          size="md"
          :aria-label="t('setKeyRevoke')"
          @click="toRevoke = item"
        />
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-key-round"
          :title="t('setKeysEmptyTitle')"
          :description="t('setKeysEmptyDescription')"
          :action-label="t('setKeyNew')"
          action-icon="i-lucide-plus"
          @action="creating = true"
        />
      </template>
    </PygList>

    <PygConfirm
      :open="Boolean(toRevoke)"
      :title="t('setRevokeKeyTitle')"
      :description="t('setRevokeKeyBody')"
      :confirm-label="t('setKeyRevoke')"
      :loading="revoking"
      @update:open="(value) => { if (!value) toRevoke = null }"
      @confirm="confirmRevoke"
    />
  </PygPage>
</template>
