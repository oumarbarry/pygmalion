<script setup lang="ts">
/**
 * « Messages envoyés » (`GET /admin/notifications`): what the framework
 * queued for a customer or a colleague, and what the provider did with it.
 *
 * The only filter the endpoint offers is `to`, which happens to be the only
 * one a merchant asks for out loud ("a-t-il bien reçu son mail ?"), so the
 * filter is a single recipient box rather than a filter bar.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { formatDateTime } = useAdminFormat()
const navItems = useSettingsNav()

const to = ref('')
const applied = ref('')
const limit = ref(20)

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ notifications: AdminNotification[] }>(
  '/api/admin/notifications',
  { query: computed(() => ({ ...(applied.value ? { to: applied.value } : {}), limit: limit.value })) },
)
const notifications = computed(() => data.value?.notifications ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const columns = computed(() => [
  { key: 'to', label: t('setMessageColTo') },
  { key: 'template', label: t('setMessageColTemplate') },
  { key: 'channel', label: t('setMessageColChannel') },
  { key: 'status', label: t('labelStatus') },
  { key: 'date', label: t('setMessageColDate') },
])

function channelLabel(channel: string): string {
  return channel === 'email' ? t('setMessageChannelEmail') : t('setMessageChannelFeed')
}
</script>

<template>
  <PygPage :title="t('setMessagesTitle')" :description="t('setMessagesSubtitle')">
    <PygSubNav :items="navItems" />

    <UCard>
      <form class="flex flex-col sm:flex-row sm:items-end gap-3" @submit.prevent="applied = to.trim()">
        <UFormField :label="t('setMessagesFilterTo')" name="to" class="flex-1">
          <UInput
            v-model="to"
            type="email"
            size="md"
            class="w-full"
            :placeholder="t('setMessagesFilterPlaceholder')"
          />
        </UFormField>
        <UButton type="submit" icon="i-lucide-search" size="md" :label="t('search')" />
        <UButton
          v-if="applied"
          color="neutral"
          variant="outline"
          size="md"
          :label="t('setMessagesClearFilter')"
          @click="to = ''; applied = ''"
        />
      </form>
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

    <PygList v-else :items="notifications" :columns="columns" :loading="loading">
      <template #cell-to="{ item }">
        <span class="font-semibold text-highlighted break-all">{{ item.to }}</span>
      </template>

      <template #cell-template="{ item }">
        <span class="font-mono text-sm text-muted">{{ item.template }}</span>
        <p v-if="item.error" class="text-xs text-error break-words">{{ item.error }}</p>
      </template>

      <template #cell-channel="{ item }">
        <span class="text-sm text-muted">{{ channelLabel(item.channel) }}</span>
      </template>

      <template #cell-status="{ item }">
        <PygStatus
          :tone="notificationStatusDisplay(item.status).tone"
          :label="t(notificationStatusDisplay(item.status).key)"
        />
      </template>

      <template #cell-date="{ item }">
        <span class="text-sm text-muted">{{ formatDateTime(item.sentAt ?? item.createdAt) }}</span>
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-send"
          :title="applied ? t('setMessagesNoResultTitle') : t('setMessagesEmptyTitle')"
          :description="applied ? t('setMessagesNoResultDescription') : t('setMessagesEmptyDescription')"
          :action-label="applied ? t('setMessagesClearFilter') : undefined"
          @action="to = ''; applied = ''"
        />
      </template>
    </PygList>

    <div v-if="notifications.length >= limit" class="flex justify-center">
      <UButton
        color="neutral"
        variant="outline"
        size="md"
        :label="t('setLoadMore')"
        @click="limit = Math.min(limit + 20, 100)"
      />
    </div>
  </PygPage>
</template>
