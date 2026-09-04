<script setup lang="ts">
/**
 * One webhook endpoint: what it listens to, and what actually went out.
 *
 * The delivery log is append-only server-side: "renvoyer" queues a NEW pending
 * delivery with the same payload instead of resetting the old row, so the list
 * grows rather than mutates — the UI just refreshes after a redeliver.
 *
 * `payload` / `lastError` / `responseStatus` stay visible verbatim (inside a
 * native `<details>`): a merchant never opens it, and the developer debugging
 * the other end needs exactly that, unmassaged.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useVocabulary()
const { formatDateTime } = useAdminFormat()
const fetcher = useAdminApi()
const navItems = useSettingsNav()
const endpointId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ webhookEndpoint: AdminWebhookEndpoint }>(
  () => `/api/admin/webhook-endpoints/${endpointId.value}`,
)
const endpoint = computed(() => data.value?.webhookEndpoint ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const {
  data: deliveryData,
  status: deliveryStatus,
  refresh: refreshDeliveries,
} = useAdminFetch<{ webhookDeliveries: AdminWebhookDelivery[] }>('/api/admin/webhook-deliveries', {
  query: computed(() => ({ endpointId: endpointId.value, limit: 50 })),
})
const deliveries = computed(() => deliveryData.value?.webhookDeliveries ?? [])
const deliveriesLoading = computed(() => deliveryStatus.value === 'pending')

const draft = reactive({ url: '', description: '', active: true, events: ['*'] as string[] })

watchEffect(() => {
  if (!endpoint.value) return
  draft.url = endpoint.value.url
  draft.description = endpoint.value.description ?? ''
  draft.active = endpoint.value.active
  draft.events = [...endpoint.value.events]
})

const saving = ref(false)

async function save() {
  if (!endpoint.value || !draft.url.trim() || !draft.events.length) return
  saving.value = true
  try {
    await fetcher(`/api/admin/webhook-endpoints/${endpoint.value.id}`, {
      method: 'POST',
      body: {
        url: draft.url.trim(),
        events: draft.events,
        active: draft.active,
        description: draft.description.trim() || null,
      },
    })
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- rotate the signing secret ----------------------------------------------------
const rotating = ref(false)
const rotateOpen = ref(false)
const revealed = ref<string | null>(null)

async function confirmRotate() {
  if (!endpoint.value) return
  rotating.value = true
  try {
    const { webhookEndpoint } = await fetcher<{ webhookEndpoint: AdminWebhookEndpoint }>(
      `/api/admin/webhook-endpoints/${endpoint.value.id}/rotate-secret`,
      { method: 'POST' },
    )
    revealed.value = webhookEndpoint.secret ?? null
    rotateOpen.value = false
  } finally {
    rotating.value = false
  }
}

// --- deliveries ---------------------------------------------------------------------
const columns = computed(() => [
  { key: 'event', label: t('setDeliveryEvent') },
  { key: 'status', label: t('labelStatus') },
  { key: 'attempts', label: t('setDeliveryAttempts') },
  { key: 'when', label: t('setDeliveryWhen') },
])

const redelivering = ref<string | null>(null)

async function redeliver(delivery: AdminWebhookDelivery) {
  redelivering.value = delivery.id
  try {
    await fetcher(`/api/admin/webhook-deliveries/${delivery.id}/redeliver`, { method: 'POST' })
    await refreshDeliveries()
  } finally {
    redelivering.value = null
  }
}

function when(delivery: AdminWebhookDelivery): string {
  return formatDateTime(delivery.deliveredAt ?? delivery.createdAt)
}
</script>

<template>
  <PygPage
    :title="endpoint?.description || endpoint?.url || t('setWebhooksTitle')"
    :description="t('setWebhooksSubtitle')"
    back-to="/admin/reglages/webhooks"
  >
    <template #actions>
      <UButton
        v-if="endpoint"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="md"
        :label="t('setRotateSecret')"
        @click="rotateOpen = true"
      />
    </template>

    <PygSubNav :items="navItems" />

    <SettingsOnceSecret
      v-if="revealed"
      :title="t('setSecretOnceTitle')"
      :description="t('setSecretOnceDescription')"
      :value="revealed"
      @close="revealed = null"
    />

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

    <div v-else-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton class="h-64 w-full rounded-2xl" />
      <USkeleton class="h-40 w-full rounded-2xl" />
    </div>

    <template v-else-if="endpoint">
      <UCard>
        <PygForm :state="draft" :loading="saving" :show-cancel="false" @submit="save">
          <UFormField :label="t('setWebhookUrl')" :description="t('setWebhookUrlHint')" name="url" required>
            <UInput v-model="draft.url" type="url" size="md" class="w-full sm:max-w-xl font-mono" />
          </UFormField>

          <UFormField :label="t('setWebhookDescription')" name="description">
            <UInput v-model="draft.description" size="md" class="w-full sm:max-w-xl" />
          </UFormField>

          <USwitch v-model="draft.active" :label="t('setActive')" />

          <UFormField :label="t('setWebhookEvents')" name="events" required>
            <SettingsEventsPicker v-model="draft.events" />
          </UFormField>
        </PygForm>
      </UCard>

      <details class="rounded-2xl border border-default">
        <summary class="pyg-tap-target flex items-center px-4 text-sm font-semibold text-default cursor-pointer">
          {{ t('setWebhookTechTitle') }}
        </summary>
        <p class="border-t border-default px-4 py-3 text-sm text-muted break-words">
          {{ t('setWebhookSigningHint') }}
        </p>
      </details>

      <div class="flex flex-col gap-3">
        <div>
          <h2 class="text-lg font-bold text-highlighted">{{ t('setDeliveriesTitle') }}</h2>
          <p class="text-sm text-muted mt-1">{{ t('setDeliveriesHint') }}</p>
        </div>

        <PygList :items="deliveries" :columns="columns" :loading="deliveriesLoading">
          <template #cell-event="{ item }">
            <span class="font-mono text-sm text-highlighted">{{ item.eventType }}</span>
            <details class="mt-1">
              <summary class="text-xs text-muted cursor-pointer">{{ t('setShowMore') }}</summary>
              <pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-muted p-2 text-xs">{{ JSON.stringify(item.payload, null, 2) }}</pre>
              <p v-if="item.responseStatus !== null" class="mt-1 text-xs text-muted">
                {{ t('setDeliveryResponse') }} : {{ item.responseStatus }}
              </p>
              <p v-if="item.lastError" class="mt-1 text-xs text-error break-words">
                {{ t('setDeliveryError') }} : {{ item.lastError }}
              </p>
            </details>
          </template>

          <template #cell-status="{ item }">
            <PygStatus :tone="deliveryStatusDisplay(item.status).tone" :label="t(deliveryStatusDisplay(item.status).key)" />
          </template>

          <template #cell-attempts="{ item }">
            <span class="tabular-nums">{{ item.attempts }}</span>
          </template>

          <template #cell-when="{ item }">
            <span class="text-sm text-muted">{{ when(item) }}</span>
          </template>

          <template #actions="{ item }">
            <UButton
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              square
              size="md"
              :aria-label="t('setDeliveryRedeliver')"
              :loading="redelivering === item.id"
              @click="redeliver(item)"
            />
          </template>

          <template #empty>
            <PygEmptyState
              icon="i-lucide-send"
              :title="t('setDeliveriesEmptyTitle')"
              :description="t('setDeliveriesEmptyDescription')"
            />
          </template>
        </PygList>
      </div>
    </template>

    <UCard v-else>
      <PygEmptyState
        icon="i-lucide-webhook"
        :title="t('setNotFound')"
        :description="t('setWebhooksEmptyDescription')"
        :action-label="t('back')"
        action-to="/admin/reglages/webhooks"
      />
    </UCard>

    <PygConfirm
      :open="rotateOpen"
      :title="t('setRotateSecretTitle')"
      :description="t('setRotateSecretBody')"
      :confirm-label="t('setRotateSecret')"
      :loading="rotating"
      @update:open="(value) => { rotateOpen = value }"
      @confirm="confirmRotate"
    />
  </PygPage>
</template>
