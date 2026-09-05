<script setup lang="ts">
/**
 * One customer: who they are, where they live, which groups they are
 * in, what they ordered. Four short sections stacked (not tabs): everything
 * a merchant needs about a person fits on one scroll, on a phone too.
 *
 * Their orders are a real server-side query (`GET /admin/orders` takes a
 * `customerId` filter), not the 100 most recent orders filtered client-side.
 */
import { orderStatusView, type OrderRow } from '../../../utils/order-status'

definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const route = useRoute()
const customerId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ customer: AdminCustomer }>(
  () => `/api/admin/customers/${customerId.value}`,
)
const customer = computed(() => data.value?.customer ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

// --- 1. Their details ---------------------------------------------------------

const profile = reactive({ name: '', phone: '' })
watch(customer, (value) => {
  if (!value) return
  profile.name = value.name
  profile.phone = value.phone ?? ''
}, { immediate: true })

const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    await fetcher(`/api/admin/customers/${customerId.value}`, {
      method: 'PATCH',
      body: {
        ...(profile.name.trim() ? { name: profile.name.trim() } : {}),
        phone: profile.phone.trim() || null,
      },
    })
    await refresh()
  } finally {
    savingProfile.value = false
  }
}

// --- 2. Their addresses -------------------------------------------------------

const { data: addressData, refresh: refreshAddresses } = useAdminFetch<{ addresses: AdminCustomerAddress[] }>(
  () => `/api/admin/customers/${customerId.value}/addresses`,
)
const addresses = computed(() => addressData.value?.addresses ?? [])

const addressDraft = reactive(emptyAddressDraft())
/** `null` = closed, `''` = creating, an id = editing that address. */
const editingAddress = ref<string | null>(null)
const savingAddress = ref(false)

function openAddress(address: AdminCustomerAddress | null) {
  Object.assign(addressDraft, address ? addressToDraft(address) : emptyAddressDraft())
  editingAddress.value = address?.id ?? ''
}

async function saveAddress() {
  savingAddress.value = true
  try {
    const base = `/api/admin/customers/${customerId.value}/addresses`
    await fetcher(editingAddress.value ? `${base}/${editingAddress.value}` : base, {
      method: editingAddress.value ? 'PATCH' : 'POST',
      body: addressBody(addressDraft),
    })
    editingAddress.value = null
    await refreshAddresses()
  } finally {
    savingAddress.value = false
  }
}

const addressToDelete = ref<AdminCustomerAddress | null>(null)
const deletingAddress = ref(false)
async function confirmDeleteAddress() {
  if (!addressToDelete.value) return
  deletingAddress.value = true
  try {
    await fetcher(`/api/admin/customers/${customerId.value}/addresses/${addressToDelete.value.id}`, { method: 'DELETE' })
    addressToDelete.value = null
    await refreshAddresses()
  } finally {
    deletingAddress.value = false
  }
}

const addressColumns = computed(() => [
  { key: 'addressName', label: t('addrLabelName') },
  { key: 'line', label: t('addressLine1'), value: (a: AdminCustomerAddress) => addressLine(a) || '—' },
])

// --- 3. Their groups ----------------------------------------------------------

const { data: groupsOfData, refresh: refreshGroupsOf } = useAdminFetch<{ customerGroups: AdminCustomerGroup[] }>(
  () => `/api/admin/customers/${customerId.value}/customer-groups`,
)
const memberOf = computed(() => groupsOfData.value?.customerGroups ?? [])

const { data: allGroupsData } = useAdminFetch<{ groups: AdminCustomerGroup[] }>('/api/admin/customer-groups', {
  query: { limit: 100 },
})
const joinableGroups = computed(() => {
  const mine = new Set(memberOf.value.map((g) => g.id))
  return (allGroupsData.value?.groups ?? []).filter((g) => !mine.has(g.id))
})

const groupToJoin = ref('')
async function joinGroup() {
  if (!groupToJoin.value) return
  await fetcher(`/api/admin/customers/${customerId.value}/customer-groups`, {
    method: 'POST',
    body: { add: [groupToJoin.value] },
  })
  groupToJoin.value = ''
  await refreshGroupsOf()
}

const groupToLeave = ref<AdminCustomerGroup | null>(null)
const leaving = ref(false)
async function confirmLeaveGroup() {
  if (!groupToLeave.value) return
  leaving.value = true
  try {
    await fetcher(`/api/admin/customers/${customerId.value}/customer-groups`, {
      method: 'POST',
      body: { remove: [groupToLeave.value.id] },
    })
    groupToLeave.value = null
    await refreshGroupsOf()
  } finally {
    leaving.value = false
  }
}

const groupColumns = computed(() => [{ key: 'name', label: t('groupNameLabel'), value: (g: AdminCustomerGroup) => g.name }])

// --- 4. Their orders ----------------------------------------------------------

const { data: ordersData } = useAdminFetch<{ orders: OrderRow[] }>('/api/admin/orders', {
  query: computed(() => ({ customerId: customerId.value, limit: 50 })),
})
const orders = computed(() => ordersData.value?.orders ?? [])

const orderColumns = computed(() => [
  { key: 'displayId', label: t('ordersColNumber') },
  { key: 'createdAt', label: t('ordersColDate') },
  { key: 'total', label: t('ordersColAmount') },
  { key: 'status', label: t('labelStatus') },
])

const { formatDate } = useAdminFormat()
</script>

<template>
  <PygPage :title="customer?.name || customer?.email || t('loading')" back-to="/admin/customers">
    <template v-if="customer" #actions>
      <PygStatus
        :tone="customerKindDisplay(customer.hasAccount).tone"
        :icon="customerKindDisplay(customer.hasAccount).icon"
        :label="t(customerKindDisplay(customer.hasAccount).key)"
      />
    </template>

    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="error || !customer"
      icon="i-lucide-user-x"
      :title="t('errorTitle')"
      :description="t('cusNotFound')"
      :action-label="t('sectionCustomers')"
      action-to="/admin/customers"
    />

    <template v-else>
      <!-- 1. Their details -->
      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted">{{ t('cusSectionProfile') }}</h2>
        </template>

        <div class="flex flex-col gap-4">
          <UAlert
            :color="customer.hasAccount ? 'success' : 'neutral'"
            variant="soft"
            :icon="customerKindDisplay(customer.hasAccount).icon"
            :description="customer.hasAccount ? t('cusAccountHint') : t('cusGuestHint')"
          />

          <PygForm :state="profile" :loading="savingProfile" :show-cancel="false" :submit-label="t('save')" @submit="saveProfile">
            <UFormField :label="t('cusEmailLabel')" :description="t('cusEmailReadOnly')" name="email">
              <UInput :model-value="customer.email" size="md" class="w-full" disabled />
            </UFormField>
            <UFormField :label="t('cusNameLabel')" name="name">
              <UInput v-model="profile.name" size="md" class="w-full" />
            </UFormField>
            <UFormField :label="t('cusPhoneLabel')" name="phone">
              <UInput v-model="profile.phone" type="tel" size="md" class="w-full" />
            </UFormField>
          </PygForm>
        </div>
      </UCard>

      <!-- 2. Their addresses -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-bold text-highlighted">{{ t('cusSectionAddresses') }}</h2>
            <UButton icon="i-lucide-plus" size="md" variant="outline" color="neutral" :label="t('addrNew')" @click="openAddress(null)" />
          </div>
        </template>

        <div class="flex flex-col gap-4">
          <div v-if="editingAddress !== null" class="rounded-2xl border border-default p-4">
            <PygForm
              :state="addressDraft"
              :loading="savingAddress"
              :submit-label="t('save')"
              @submit="saveAddress"
              @cancel="editingAddress = null"
            >
              <UFormField :label="t('addrLabelName')" :description="t('addrLabelNameHint')" name="addressName">
                <UInput v-model="addressDraft.addressName" size="md" class="w-full" />
              </UFormField>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField :label="t('addressFirstName')" name="firstName">
                  <UInput v-model="addressDraft.firstName" size="md" class="w-full" />
                </UFormField>
                <UFormField :label="t('addressLastName')" name="lastName">
                  <UInput v-model="addressDraft.lastName" size="md" class="w-full" />
                </UFormField>
              </div>

              <UFormField :label="t('addrCompany')" name="company">
                <UInput v-model="addressDraft.company" size="md" class="w-full" />
              </UFormField>

              <UFormField :label="t('addressLine1')" name="address1">
                <UInput v-model="addressDraft.address1" size="md" class="w-full" />
              </UFormField>
              <UFormField :label="t('addrLine2')" name="address2">
                <UInput v-model="addressDraft.address2" size="md" class="w-full" />
              </UFormField>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField :label="t('addressPostalCode')" name="postalCode">
                  <UInput v-model="addressDraft.postalCode" size="md" class="w-full" />
                </UFormField>
                <UFormField :label="t('addressCity')" name="city">
                  <UInput v-model="addressDraft.city" size="md" class="w-full" />
                </UFormField>
                <UFormField :label="t('addrProvince')" name="province">
                  <UInput v-model="addressDraft.province" size="md" class="w-full" />
                </UFormField>
                <UFormField :label="t('addressCountry')" name="countryCode">
                  <UInput v-model="addressDraft.countryCode" size="md" class="w-full" maxlength="2" />
                </UFormField>
              </div>

              <UFormField :label="t('addressPhone')" name="phone">
                <UInput v-model="addressDraft.phone" type="tel" size="md" class="w-full" />
              </UFormField>

              <div class="flex flex-col gap-3">
                <USwitch v-model="addressDraft.isDefaultShipping" :label="t('addrIsDefaultShipping')" />
                <USwitch v-model="addressDraft.isDefaultBilling" :label="t('addrIsDefaultBilling')" />
              </div>
            </PygForm>
          </div>

          <PygList :items="addresses" :columns="addressColumns">
            <template #cell-addressName="{ item }">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-highlighted">{{ item.addressName || [item.firstName, item.lastName].filter(Boolean).join(' ') || t('cusNoName') }}</span>
                <PygStatus v-if="item.isDefaultShipping" tone="info" icon="i-lucide-truck" :label="t('addrDefaultShipping')" />
                <PygStatus v-if="item.isDefaultBilling" tone="info" icon="i-lucide-receipt" :label="t('addrDefaultBilling')" />
              </span>
            </template>
            <template #actions="{ item }">
              <span class="flex items-center gap-1">
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  square
                  size="md"
                  :aria-label="t('edit')"
                  @click="openAddress(item)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  square
                  size="md"
                  :aria-label="t('delete')"
                  @click="addressToDelete = item"
                />
              </span>
            </template>
            <template #empty>
              <PygEmptyState
                icon="i-lucide-map-pin"
                :title="t('addrEmptyTitle')"
                :description="t('addrEmptyDescription')"
                :action-label="t('addrNew')"
                action-icon="i-lucide-plus"
                @action="openAddress(null)"
              />
            </template>
          </PygList>
        </div>
      </UCard>

      <!-- 3. Their groups -->
      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted">{{ t('cusSectionGroups') }}</h2>
        </template>

        <div class="flex flex-col gap-4">
          <div v-if="joinableGroups.length" class="flex flex-col sm:flex-row sm:items-end gap-3">
            <UFormField :label="t('cusGroupAdd')" name="join-group" class="flex-1">
              <USelect
                v-model="groupToJoin"
                :items="joinableGroups.map((g) => ({ label: g.name, value: g.id }))"
                value-key="value"
                size="md"
                class="w-full"
                :placeholder="t('cusGroupAddPlaceholder')"
              />
            </UFormField>
            <UButton icon="i-lucide-plus" size="md" :label="t('add')" :disabled="!groupToJoin" @click="joinGroup" />
          </div>

          <PygList :items="memberOf" :columns="groupColumns" :to="(g) => `/admin/customers/groups/${g.id}`">
            <template #cell-name="{ item }">
              <span class="font-semibold text-highlighted">{{ item.name }}</span>
            </template>
            <template #actions="{ item }">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                square
                size="md"
                :aria-label="t('remove')"
                @click="groupToLeave = item"
              />
            </template>
            <template #empty>
              <PygEmptyState
                icon="i-lucide-users-round"
                :title="t('cusGroupsEmptyTitle')"
                :description="t('cusGroupsEmptyDescription')"
                :action-label="joinableGroups.length ? undefined : t('groupNew')"
                action-to="/admin/customers/groups"
              />
            </template>
          </PygList>
        </div>
      </UCard>

      <!-- 4. Their orders -->
      <UCard>
        <template #header>
          <h2 class="font-bold text-highlighted">{{ t('cusSectionOrders') }}</h2>
        </template>

        <div class="flex flex-col gap-4">
          <PygList :items="orders" :columns="orderColumns" :to="(o) => `/admin/orders/${o.id}`">
            <template #cell-displayId="{ item }">
              <span class="font-bold text-highlighted">{{ t('orderNumberPrefix') }}{{ item.displayId }}</span>
            </template>
            <template #cell-createdAt="{ item }">
              {{ formatDate(item.createdAt) }}
            </template>
            <template #cell-total="{ item }">
              <PygMoney :cents="item.total" :currency="item.currencyCode" size="md" />
            </template>
            <template #cell-status="{ item }">
              <PygStatus
                :tone="orderStatusView(item.status).tone"
                :icon="orderStatusView(item.status).icon"
                :label="t(orderStatusView(item.status).key)"
              />
            </template>
            <template #empty>
              <PygEmptyState
                icon="i-lucide-receipt-text"
                :title="t('cusOrdersEmptyTitle')"
                :description="t('cusOrdersEmptyDescription')"
              />
            </template>
          </PygList>

        </div>
      </UCard>
    </template>

    <PygConfirm
      :open="Boolean(addressToDelete)"
      :title="t('addrDeleteTitle')"
      :description="t('addrDeleteBody')"
      :confirm-label="t('delete')"
      :loading="deletingAddress"
      @update:open="(value) => { if (!value) addressToDelete = null }"
      @confirm="confirmDeleteAddress"
    />

    <PygConfirm
      :open="Boolean(groupToLeave)"
      :title="t('cusGroupRemoveTitle')"
      :description="t('cusGroupRemoveBody')"
      :confirm-label="t('remove')"
      :loading="leaving"
      @update:open="(value) => { if (!value) groupToLeave = null }"
      @confirm="confirmLeaveGroup"
    />
  </PygPage>
</template>
