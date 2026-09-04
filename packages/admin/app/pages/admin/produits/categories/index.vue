<script setup lang="ts">
/**
 * Catégories: the store's aisles, as a tree. Moving a category is a
 * plain « ranger dans » select (the API recomputes the whole subtree's mpath),
 * not drag'n'drop — a merchant on a phone can't drag a nested row, and the
 * select is the accessible affordance for the same operation.
 *
 * The tree is flattened to an indented list rather than a self-recursive
 * component: one `v-for`, one depth number, no extra file.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const navItems = useCatalogNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ categories: AdminCategory[] }>(
  '/api/admin/product-categories',
  { query: { limit: 200 } },
)
const categories = computed(() => data.value?.categories ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const collapsed = ref(new Set<string>())

interface TreeRow { category: AdminCategory; depth: number; hasChildren: boolean }

const rows = computed<TreeRow[]>(() => {
  const byParent = new Map<string | null, AdminCategory[]>()
  for (const category of categories.value) {
    const bucket = byParent.get(category.parentCategoryId) ?? []
    bucket.push(category)
    byParent.set(category.parentCategoryId, bucket)
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
  }
  const out: TreeRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const category of byParent.get(parentId) ?? []) {
      const children = byParent.get(category.id) ?? []
      out.push({ category, depth, hasChildren: children.length > 0 })
      if (children.length && !collapsed.value.has(category.id)) walk(category.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

// --- create -----------------------------------------------------------------
const creating = ref(false)
// SELECT_NONE, never '' — an empty SelectItem value crashes Reka UI.
const draft = reactive({ name: '', parentCategoryId: SELECT_NONE as string, isActive: true })
const saving = ref(false)

function startCreate(parentId: string | null) {
  draft.name = ''
  draft.parentCategoryId = parentId ?? SELECT_NONE
  draft.isActive = true
  creating.value = true
  editing.value = null
}

async function create() {
  if (!draft.name.trim()) return
  saving.value = true
  try {
    await $adminFetch('/api/admin/product-categories', {
      method: 'POST',
      body: {
        name: draft.name.trim(),
        parentCategoryId: selectValue(draft.parentCategoryId) || null,
        isActive: draft.isActive,
      },
    })
    creating.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- edit / move -------------------------------------------------------------
const editing = ref<AdminCategory | null>(null)
const editForm = reactive({ name: '', parentCategoryId: SELECT_NONE as string, isActive: true })

function startEdit(category: AdminCategory) {
  editing.value = category
  editForm.name = category.name
  editForm.parentCategoryId = category.parentCategoryId ?? SELECT_NONE
  editForm.isActive = category.isActive
  creating.value = false
}

/** A category can't be filed under itself or under one of its own descendants. */
const parentOptionsForEdit = computed(() => {
  const current = editing.value
  const forbidden = (category: AdminCategory) =>
    current ? category.id === current.id || category.mpath.startsWith(`${current.mpath}.`) : false
  return [
    { label: t('categoryNoParent'), value: SELECT_NONE },
    ...categories.value.filter((c) => !forbidden(c)).map((c) => ({ label: c.name, value: c.id })),
  ]
})

const parentOptionsForCreate = computed(() => [
  { label: t('categoryNoParent'), value: SELECT_NONE },
  ...categories.value.map((c) => ({ label: c.name, value: c.id })),
])

async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    await $adminFetch(`/api/admin/product-categories/${editing.value.id}`, {
      method: 'POST',
      body: {
        name: editForm.name.trim(),
        parentCategoryId: selectValue(editForm.parentCategoryId) || null,
        isActive: editForm.isActive,
      },
    })
    editing.value = null
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- delete ------------------------------------------------------------------
const toDelete = ref<AdminCategory | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await $adminFetch(`/api/admin/product-categories/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PygPage :title="t('categories')" :description="t('categoriesSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-plus" size="md" :label="t('newCategory')" @click="startCreate(null)" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false"
      >
        <UFormField :label="t('categoryNameLabel')" name="name" required>
          <UInput v-model="draft.name" size="md" class="w-full" autofocus />
        </UFormField>
        <UFormField :label="t('categoryParentLabel')" name="parent" class="sm:w-72">
          <USelect v-model="draft.parentCategoryId" :items="parentOptionsForCreate" value-key="value" size="md" class="w-full" />
        </UFormField>
        <USwitch v-model="draft.isActive" :label="t('categoryVisible')" :description="t('categoryVisibleHint')" />
      </PygForm>
    </UCard>

    <UCard v-if="editing">
      <PygForm
        :state="editForm"
        :loading="saving"
        :submit-label="t('save')"
        @submit="saveEdit"
        @cancel="editing = null"
      >
        <UFormField :label="t('categoryNameLabel')" name="edit-name" required>
          <UInput v-model="editForm.name" size="md" class="w-full" />
        </UFormField>
        <UFormField :label="t('categoryParentLabel')" name="edit-parent" class="sm:w-72">
          <USelect v-model="editForm.parentCategoryId" :items="parentOptionsForEdit" value-key="value" size="md" class="w-full" />
        </UFormField>
        <USwitch v-model="editForm.isActive" :label="t('categoryVisible')" :description="t('categoryVisibleHint')" />
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
      v-else-if="!rows.length"
      icon="i-lucide-folder-tree"
      :title="t('categoriesEmptyTitle')"
      :description="t('categoriesEmptyDescription')"
      :action-label="t('newCategory')"
      action-icon="i-lucide-plus"
      @action="startCreate(null)"
    />

    <ul v-else class="flex flex-col gap-1">
      <li
        v-for="row in rows"
        :key="row.category.id"
        class="flex items-center gap-2 rounded-xl border border-default bg-default px-2 min-h-14"
        :style="{ marginInlineStart: `${row.depth * 1.5}rem` }"
      >
        <UButton
          v-if="row.hasChildren"
          :icon="collapsed.has(row.category.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="collapsed.has(row.category.id) ? t('expandCategory') : t('collapseCategory')"
          :aria-expanded="!collapsed.has(row.category.id)"
          @click="toggle(row.category.id)"
        />
        <span v-else class="size-11 shrink-0" />

        <span class="flex-1 min-w-0 truncate font-semibold text-highlighted">{{ row.category.name }}</span>

        <PygStatus
          :label="row.category.isActive ? t('categoryVisible') : t('categoryHidden')"
          :tone="row.category.isActive ? 'success' : 'neutral'"
          :icon="row.category.isActive ? 'i-lucide-eye' : 'i-lucide-eye-off'"
        />

        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="t('newSubcategory')"
          @click="startCreate(row.category.id)"
        />
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="t('edit')"
          @click="startEdit(row.category)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          square
          size="md"
          :aria-label="t('delete')"
          @click="toDelete = row.category"
        />
      </li>
    </ul>

    <PygConfirm
      :open="Boolean(toDelete)"
      :title="t('deleteCategoryTitle')"
      :description="t('deleteCategoryBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { if (!value) toDelete = null }"
      @confirm="confirmDelete"
    />
  </PygPage>
</template>
