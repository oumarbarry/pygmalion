<script setup lang="ts">
/**
 * One sales channel: rename, describe, open or close it.
 *
 * The products attached to a channel are NOT readable. `GET /admin/sales-channels/:id`
 * returns the row alone, `GET /admin/products` has no channel filter, and the
 * only surface that returns `productIds` is `POST .../products`, which emits
 * `sales-channel.products-updated` — calling it to *read* would fire a webhook
 * on every page view. So this screen states where the link is made instead of
 * faking a list.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()
const channelId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ salesChannel: AdminSalesChannelDetail }>(
  () => `/api/admin/sales-channels/${channelId.value}`,
)
const channel = computed(() => data.value?.salesChannel ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const draft = reactive({ name: '', description: '', open: true })

watchEffect(() => {
  if (!channel.value) return
  draft.name = channel.value.name
  draft.description = channel.value.description ?? ''
  draft.open = !channel.value.isDisabled
})

const saving = ref(false)

async function save() {
  if (!channel.value || !draft.name.trim()) return
  saving.value = true
  try {
    await fetcher(`/api/admin/sales-channels/${channel.value.id}`, {
      method: 'POST',
      body: {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        isDisabled: !draft.open,
      },
    })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PygPage
    :title="channel?.name ?? t('setChannelsTitle')"
    :description="t('setChannelsSubtitle')"
    back-to="/admin/reglages/canaux"
  >
    <PygSubNav :items="navItems" />

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
      <USkeleton class="h-56 w-full rounded-2xl" />
    </div>

    <template v-else-if="channel">
      <UCard>
        <PygForm :state="draft" :loading="saving" :show-cancel="false" @submit="save">
          <UFormField :label="t('setChannelName')" name="name" required>
            <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" />
          </UFormField>
          <UFormField :label="t('setChannelDescription')" name="description">
            <UTextarea v-model="draft.description" :rows="2" class="w-full sm:max-w-md" />
          </UFormField>
          <USwitch v-model="draft.open" :label="t('setChannelOpen')" :description="t('setChannelOpenHint')" />
        </PygForm>
      </UCard>

      <UCard>
        <PygEmptyState
          icon="i-lucide-shopping-bag"
          :title="t('setChannelProducts')"
          :description="t('setChannelProductsEmptyDescription')"
          :action-label="t('sectionProducts')"
          action-icon="i-lucide-shopping-bag"
          action-to="/admin/produits"
        />
      </UCard>
    </template>

    <UCard v-else>
      <PygEmptyState
        icon="i-lucide-radio"
        :title="t('setNotFound')"
        :description="t('setChannelsEmptyDescription')"
        :action-label="t('back')"
        action-to="/admin/reglages/canaux"
      />
    </UCard>
  </PygPage>
</template>
