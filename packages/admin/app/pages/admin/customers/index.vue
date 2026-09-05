<script setup lang="ts">
/**
 * The customers list. Search goes to the API (`?q=` matches name OR
 * email, server-side); "with / without an account" is a client-side filter
 * on the loaded page because `GET /api/admin/customers` takes no such
 * parameter.
 *
 * Creating a customer is a single inline form, not a wizard: wizards are
 * for *composed* operations, and this is three fields.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useCustomersNav()

const PAGE = 50
type Kind = 'all' | 'account' | 'guest'

const customers = ref<AdminCustomer[]>([])
const loading = ref(true)
const failed = ref(false)
const hasMore = ref(false)
const query = ref('')
const kind = ref<Kind>('all')

async function load(more = false) {
  loading.value = true
  failed.value = false
  try {
    const offset = more ? customers.value.length : 0
    const search = query.value.trim()
    const res = await fetcher<{ customers: AdminCustomer[] }>('/api/admin/customers', {
      query: { limit: PAGE, offset, ...(search ? { q: search } : {}) },
    })
    customers.value = more ? [...customers.value, ...res.customers] : res.customers
    hasMore.value = res.customers.length === PAGE
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(), 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const visible = computed(() =>
  customers.value.filter((c) => (kind.value === 'all' ? true : kind.value === 'account' ? c.hasAccount : !c.hasAccount)),
)

const kinds = computed(() => [
  { key: 'all' as const, label: t('cusFilterAll'), icon: 'i-lucide-users' },
  { key: 'account' as const, label: t('cusFilterAccount'), icon: 'i-lucide-user-check' },
  { key: 'guest' as const, label: t('cusFilterGuest'), icon: 'i-lucide-user' },
])

const columns = computed(() => [
  { key: 'name', label: t('cusColName') },
  { key: 'email', label: t('cusColEmail'), value: (c: AdminCustomer) => c.email },
  { key: 'phone', label: t('cusColPhone'), value: (c: AdminCustomer) => c.phone ?? '—' },
  { key: 'hasAccount', label: t('cusColKind') },
  { key: 'createdAt', label: t('cusColSince') },
])

// --- Creating a customer ------------------------------------------------------

const creating = ref(false)
const saving = ref(false)
const createError = ref<string | null>(null)
const draft = reactive({ email: '', name: '', phone: '' })

function resetDraft() {
  draft.email = ''
  draft.name = ''
  draft.phone = ''
  createError.value = null
}

async function create() {
  const email = draft.email.trim().toLowerCase()
  if (!email) return
  saving.value = true
  createError.value = null
  try {
    // The duplicate-email guard on POST /api/admin/customers never fires (it
    // tests the drizzle wrapper's message, the unique violation is in its
    // `cause`), so the merchant would get a bare "something went wrong"
    // instead of a usable sentence. One search first says it
    // in plain language; the 409 branch below stays for when that is fixed.
    const existing = await fetcher<{ customers: AdminCustomer[] }>('/api/admin/customers', {
      query: { q: email, limit: 50 },
    })
    if (existing.customers.some((c) => c.email.toLowerCase() === email)) {
      createError.value = t('cusEmailTaken')
      return
    }

    const { customer } = await fetcher<{ customer: AdminCustomer }>('/api/admin/customers', {
      method: 'POST',
      body: {
        email,
        name: draft.name.trim(),
        ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
      },
    })
    creating.value = false
    resetDraft()
    await navigateTo(`/admin/customers/${customer.id}`)
  } catch (error) {
    createError.value = (error as { statusCode?: number }).statusCode === 409 ? t('cusEmailTaken') : t('errorGeneric')
  } finally {
    saving.value = false
  }
}

const { formatDate } = useAdminFormat()
</script>

<template>
  <PygPage :title="t('sectionCustomers')" :description="t('customersSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-user-plus" size="md" :label="t('cusNew')" @click="creating = true" />
    </template>

    <PygSubNav :items="navItems" />

    <UCard v-if="creating">
      <PygForm
        :state="draft"
        :loading="saving"
        :error="createError"
        :submit-label="t('create')"
        @submit="create"
        @cancel="creating = false; resetDraft()"
      >
        <p class="text-sm text-muted">{{ t('cusNewHint') }}</p>

        <UFormField :label="t('cusEmailLabel')" :description="t('cusEmailHint')" name="email" required>
          <UInput v-model="draft.email" type="email" size="md" class="w-full" autofocus />
        </UFormField>

        <UFormField :label="t('cusNameLabel')" name="name">
          <UInput v-model="draft.name" size="md" class="w-full" />
        </UFormField>

        <UFormField :label="t('cusPhoneLabel')" name="phone">
          <UInput v-model="draft.phone" type="tel" size="md" class="w-full" />
        </UFormField>
      </PygForm>
    </UCard>

    <div class="flex flex-col gap-4">
      <UInput
        v-model="query"
        size="lg"
        icon="i-lucide-search"
        :placeholder="t('cusSearchPlaceholder')"
        :aria-label="t('search')"
      />

      <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" :aria-label="t('cusColKind')">
        <UButton
          v-for="item in kinds"
          :key="item.key"
          role="tab"
          :aria-selected="kind === item.key"
          :color="kind === item.key ? 'primary' : 'neutral'"
          :variant="kind === item.key ? 'soft' : 'ghost'"
          :icon="item.icon"
          :label="item.label"
          class="shrink-0"
          @click="kind = item.key"
        />
      </div>

      <UAlert
        v-if="failed"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="t('errorTitle')"
        :description="t('errorGeneric')"
      >
        <template #actions>
          <UButton color="error" variant="outline" size="sm" :label="t('retry')" @click="load()" />
        </template>
      </UAlert>

      <PygList
        v-else
        :items="visible"
        :columns="columns"
        :loading="loading && !customers.length"
        :to="(c) => `/admin/customers/${c.id}`"
      >
        <template #cell-name="{ item }">
          <span class="font-semibold text-highlighted">{{ item.name || t('cusNoName') }}</span>
        </template>
        <template #cell-hasAccount="{ item }">
          <PygStatus
            :tone="customerKindDisplay(item.hasAccount).tone"
            :icon="customerKindDisplay(item.hasAccount).icon"
            :label="t(customerKindDisplay(item.hasAccount).key)"
          />
        </template>
        <template #cell-createdAt="{ item }">
          {{ formatDate(item.createdAt) }}
        </template>

        <template #empty>
          <PygEmptyState
            :icon="query.trim() ? 'i-lucide-search-x' : 'i-lucide-users'"
            :title="query.trim() ? t('cusNoResultsTitle') : t('cusEmptyTitle')"
            :description="query.trim() ? t('cusNoResultsDescription') : t('cusEmptyDescription')"
            :action-label="query.trim() ? undefined : t('cusNew')"
            action-icon="i-lucide-user-plus"
            @action="creating = true"
          />
        </template>
      </PygList>

      <div v-if="hasMore && !failed" class="flex justify-center">
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-chevron-down"
          :label="t('cusLoadMore')"
          :loading="loading"
          @click="load(true)"
        />
      </div>
    </div>
  </PygPage>
</template>
