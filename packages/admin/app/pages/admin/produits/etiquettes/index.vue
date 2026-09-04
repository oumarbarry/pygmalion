<script setup lang="ts">
/**
 * Étiquettes: one word each, so the whole screen is inline. Create at
 * the top, rename in place (blur saves), delete with its consequence spelled
 * out.
 *
 * Merging two tags is deliberately absent: it means moving every product from
 * one tag to another, and no admin route links a product to a tag today.
 * Renaming covers the
 * "same thing, two spellings" case a merchant actually hits.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const navItems = useCatalogNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ tags: AdminTag[] }>('/api/admin/product-tags', {
  query: { limit: 200 },
})
const tags = computed(() => data.value?.tags ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const values = reactive<Record<string, string>>({})
watch(tags, (list) => { for (const tag of list) values[tag.id] = tag.value }, { immediate: true })

const draft = reactive({ value: '' })
const saving = ref(false)

async function create() {
  if (!draft.value.trim()) return
  saving.value = true
  try {
    await $adminFetch('/api/admin/product-tags', { method: 'POST', body: { value: draft.value.trim() } })
    draft.value = ''
    await refresh()
  } finally {
    saving.value = false
  }
}

async function rename(tag: AdminTag) {
  const next = values[tag.id]?.trim()
  if (!next || next === tag.value) return
  await $adminFetch(`/api/admin/product-tags/${tag.id}`, { method: 'POST', body: { value: next } })
  await refresh()
}

const toDelete = ref<AdminTag | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await $adminFetch(`/api/admin/product-tags/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('tags')" :description="t('tagsSubtitle')">
    <PygSubNav :items="navItems" />

    <UCard>
      <PygForm :state="draft" :loading="saving" :show-cancel="false" :submit-label="t('newTag')" @submit="create">
        <UFormField :label="t('tagValueLabel')" name="value" required>
          <UInput v-model="draft.value" size="md" class="w-full" />
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

    <div v-else-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 4" :key="n" class="h-14 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="!tags.length"
      icon="i-lucide-tags"
      :title="t('tagsEmptyTitle')"
      :description="t('tagsEmptyDescription')"
    />

    <ul v-else class="flex flex-col gap-2">
      <li v-for="tag in tags" :key="tag.id" class="flex items-center gap-2 rounded-xl border border-default bg-default p-2">
        <UFormField :label="t('renameTag')" :name="`tag-${tag.id}`" class="flex-1">
          <UInput v-model="values[tag.id]" size="md" class="w-full" @blur="rename(tag)" @keyup.enter="rename(tag)" />
        </UFormField>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          square
          size="md"
          :aria-label="t('delete')"
          @click="toDelete = tag"
        />
      </li>
    </ul>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('deleteTagTitle')"
      :description="t('deleteTagBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
