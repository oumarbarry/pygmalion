<script setup lang="ts">
/**
 * Livraison, level 2: the areas one delivery method covers.
 * `GET /admin/fulfillment-sets/:id` already returns its service zones, so the
 * whole page is one read.
 */
definePageMeta({ layout: 'admin' })

const route = useRoute()
const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()
const setId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{
  fulfillmentSet: AdminFulfillmentSet
  serviceZones: AdminServiceZone[]
}>(() => `/api/admin/fulfillment-sets/${setId.value}`)

const fulfillmentSet = computed(() => data.value?.fulfillmentSet ?? null)
const zones = computed(() => data.value?.serviceZones ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const columns = computed(() => [
  { key: 'name', label: t('setZoneName'), value: (z: AdminServiceZone) => z.name },
])

// --- rename the delivery method --------------------------------------------------
const nameDraft = reactive({ name: '' })
watchEffect(() => {
  if (fulfillmentSet.value) nameDraft.name = fulfillmentSet.value.name
})
const renaming = ref(false)

async function rename() {
  if (!fulfillmentSet.value || !nameDraft.name.trim()) return
  renaming.value = true
  try {
    await fetcher(`/api/admin/fulfillment-sets/${fulfillmentSet.value.id}`, {
      method: 'POST',
      body: { name: nameDraft.name.trim() },
    })
    await refresh()
  } finally {
    renaming.value = false
  }
}

// --- create a delivered area ------------------------------------------------------
const creating = ref(false)
const saving = ref(false)
const draft = reactive({ name: '', countries: [] as string[] })

async function createZone() {
  if (!draft.name.trim()) return
  saving.value = true
  try {
    await fetcher(`/api/admin/fulfillment-sets/${setId.value}/service-zones`, {
      method: 'POST',
      body: {
        name: draft.name.trim(),
        geoZones: draft.countries.map((iso2) => ({ type: 'country', countryCode: iso2.toLowerCase() })),
      },
    })
    creating.value = false
    draft.name = ''
    draft.countries = []
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- delete ------------------------------------------------------------------------
const toDelete = ref<AdminServiceZone | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await fetcher(`/api/admin/fulfillment-sets/${setId.value}/service-zones/${toDelete.value.id}`, {
      method: 'DELETE',
    })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage
    :title="fulfillmentSet?.name ?? t('setShippingTitle')"
    :description="t('setZonesTitle')"
    back-to="/admin/reglages/livraison"
  >
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setZoneNew')" @click="creating = true" />
    </template>

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
      <USkeleton class="h-32 w-full rounded-2xl" />
      <USkeleton class="h-40 w-full rounded-2xl" />
    </div>

    <template v-else-if="fulfillmentSet">
      <UCard>
        <PygForm :state="nameDraft" :loading="renaming" :show-cancel="false" @submit="rename">
          <UFormField :label="t('setFsetName')" name="name" required>
            <UInput v-model="nameDraft.name" size="md" class="w-full sm:max-w-md" />
          </UFormField>
        </PygForm>
      </UCard>

      <UCard v-if="creating">
        <PygForm
          :state="draft"
          :loading="saving"
          :submit-label="t('create')"
          @submit="createZone"
          @cancel="creating = false; draft.name = ''; draft.countries = []"
        >
          <UFormField :label="t('setZoneName')" name="name" required>
            <UInput v-model="draft.name" size="md" class="w-full sm:max-w-md" autofocus />
          </UFormField>
          <UFormField :label="t('setZoneCountries')" :description="t('setZoneCountriesHint')" name="countries">
            <SettingsCountryPicker v-model="draft.countries" />
          </UFormField>
        </PygForm>
      </UCard>

      <PygList
        :items="zones"
        :columns="columns"
        :to="(z) => `/admin/reglages/livraison/${setId}/${z.id}`"
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
            icon="i-lucide-map"
            :title="t('setZonesEmptyTitle')"
            :description="t('setZonesEmptyDescription')"
            :action-label="t('setZoneNew')"
            action-icon="i-lucide-plus"
            @action="creating = true"
          />
        </template>
      </PygList>
    </template>

    <UCard v-else>
      <PygEmptyState
        icon="i-lucide-truck"
        :title="t('setNotFound')"
        :description="t('setFsetsEmptyDescription')"
        :action-label="t('back')"
        action-to="/admin/reglages/livraison"
      />
    </UCard>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('setDeleteZoneTitle')"
      :description="t('setDeleteZoneBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
