<script setup lang="ts">
/**
 * Livraison, level 1. Two lists, because they answer two different
 * questions and neither is a step of the other:
 *   - « modes de livraison » (`fulfillment_sets`) → where and how you ship;
 *   - « groupes de produits » (`shipping_profiles`) → which products travel
 *     together, referenced by every delivery price.
 *
 * Deliberately not a wizard: creating either one is a single field, and a
 * merchant coming back to add a second zone must not be walked through the
 * whole thing again (wizards are for *composed* operations).
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ fulfillmentSets: AdminFulfillmentSet[] }>(
  '/api/admin/fulfillment-sets',
  { query: { limit: 100 } },
)
const sets = computed(() => data.value?.fulfillmentSets ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const {
  data: profileData,
  status: profileStatus,
  refresh: refreshProfiles,
} = useAdminFetch<{ shippingProfiles: AdminShippingProfile[] }>('/api/admin/shipping-profiles', {
  query: { limit: 100 },
})
const profiles = computed(() => profileData.value?.shippingProfiles ?? [])
const profilesLoading = computed(() => profileStatus.value === 'pending')

const setColumns = computed(() => [
  { key: 'name', label: t('setFsetName'), value: (s: AdminFulfillmentSet) => s.name },
])
const profileColumns = computed(() => [
  { key: 'name', label: t('setProfileName'), value: (p: AdminShippingProfile) => p.name },
  { key: 'default', label: t('setProfileDefault') },
])

// --- create a delivery method ---------------------------------------------------
const creatingSet = ref(false)
const savingSet = ref(false)
const setDraft = reactive({ name: '' })

async function createSet() {
  if (!setDraft.name.trim()) return
  savingSet.value = true
  try {
    await fetcher('/api/admin/fulfillment-sets', { method: 'POST', body: { name: setDraft.name.trim() } })
    creatingSet.value = false
    setDraft.name = ''
    await refresh()
  } finally {
    savingSet.value = false
  }
}

const setToDelete = ref<AdminFulfillmentSet | null>(null)
const deletingSet = ref(false)

async function confirmDeleteSet() {
  if (!setToDelete.value) return
  deletingSet.value = true
  try {
    await fetcher(`/api/admin/fulfillment-sets/${setToDelete.value.id}`, { method: 'DELETE' })
    setToDelete.value = null
    await refresh()
  } finally {
    deletingSet.value = false
  }
}

// --- create a product group -----------------------------------------------------
const creatingProfile = ref(false)
const savingProfile = ref(false)
const profileDraft = reactive({ name: '', isDefault: false })

async function createProfile() {
  if (!profileDraft.name.trim()) return
  savingProfile.value = true
  try {
    await fetcher('/api/admin/shipping-profiles', {
      method: 'POST',
      body: { name: profileDraft.name.trim(), isDefault: profileDraft.isDefault },
    })
    creatingProfile.value = false
    profileDraft.name = ''
    profileDraft.isDefault = false
    await refreshProfiles()
  } finally {
    savingProfile.value = false
  }
}

const profileToDelete = ref<AdminShippingProfile | null>(null)
const deletingProfile = ref(false)

async function confirmDeleteProfile() {
  if (!profileToDelete.value) return
  deletingProfile.value = true
  try {
    await fetcher(`/api/admin/shipping-profiles/${profileToDelete.value.id}`, { method: 'DELETE' })
    profileToDelete.value = null
    await refreshProfiles()
  } finally {
    deletingProfile.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setShippingTitle')" :description="t('setShippingSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('setFsetNew')" @click="creatingSet = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creatingSet">
      <PygForm
        :state="setDraft"
        :loading="savingSet"
        :submit-label="t('create')"
        @submit="createSet"
        @cancel="creatingSet = false; setDraft.name = ''"
      >
        <UFormField :label="t('setFsetName')" name="name" required>
          <UInput v-model="setDraft.name" size="md" class="w-full sm:max-w-md" autofocus />
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
      :items="sets"
      :columns="setColumns"
      :loading="loading"
      :to="(s) => `/admin/settings/shipping/${s.id}`"
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
          @click="setToDelete = item"
        />
      </template>

      <template #empty>
        <PygEmptyState
          icon="i-lucide-truck"
          :title="t('setFsetsEmptyTitle')"
          :description="t('setFsetsEmptyDescription')"
          :action-label="t('setFsetNew')"
          action-icon="i-lucide-plus"
          @action="creatingSet = true"
        />
      </template>
    </PygList>

    <UCard>
      <div class="flex flex-col gap-5">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-highlighted">{{ t('setProfilesTitle') }}</h2>
            <p class="text-sm text-muted mt-1">{{ t('setProfilesHint') }}</p>
          </div>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="md"
            class="shrink-0"
            :label="t('setProfileNew')"
            @click="creatingProfile = true"
          />
        </div>

        <PygForm
          v-if="creatingProfile"
          :state="profileDraft"
          :loading="savingProfile"
          :submit-label="t('create')"
          @submit="createProfile"
          @cancel="creatingProfile = false; profileDraft.name = ''"
        >
          <UFormField :label="t('setProfileName')" name="name" required>
            <UInput v-model="profileDraft.name" size="md" class="w-full sm:max-w-md" autofocus />
          </UFormField>
          <USwitch v-model="profileDraft.isDefault" :label="t('setProfileDefault')" />
        </PygForm>

        <PygList :items="profiles" :columns="profileColumns" :loading="profilesLoading">
          <template #cell-name="{ item }">
            <span class="font-semibold text-highlighted">{{ item.name }}</span>
          </template>

          <template #cell-default="{ item }">
            <PygStatus
              :tone="item.isDefault ? 'success' : 'neutral'"
              :label="item.isDefault ? t('yes') : t('no')"
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
              @click="profileToDelete = item"
            />
          </template>

          <template #empty>
            <PygEmptyState
              icon="i-lucide-package"
              :title="t('setProfilesEmptyTitle')"
              :description="t('setProfilesEmptyDescription')"
              :action-label="t('setProfileNew')"
              action-icon="i-lucide-plus"
              @action="creatingProfile = true"
            />
          </template>
        </PygList>
      </div>
    </UCard>

    <PygConfirm
      :open="Boolean(setToDelete)"
      :title="t('setDeleteFsetTitle')"
      :description="t('setDeleteFsetBody')"
      :confirm-label="t('delete')"
      :loading="deletingSet"
      @update:open="(value) => { if (!value) setToDelete = null }"
      @confirm="confirmDeleteSet"
    />

    <PygConfirm
      :open="Boolean(profileToDelete)"
      :title="t('setDeleteProfileTitle')"
      :description="t('setDeleteProfileBody')"
      :confirm-label="t('delete')"
      :loading="deletingProfile"
      @update:open="(value) => { if (!value) profileToDelete = null }"
      @confirm="confirmDeleteProfile"
    />
  </PygPage>
</template>
