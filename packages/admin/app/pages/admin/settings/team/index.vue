<script setup lang="ts">
/**
 * Équipe. Two lists on one screen because they're two halves of the same
 * question: who is already in, and who has been asked in.
 *
 * Roles are shown as words a merchant uses (« Patron », « Gérant »,
 * « Préparateur ») with the one sentence that says what each may do — the
 * stored values (`owner`/`manager`/`fulfiller`) never surface.
 *
 * The invite token is a bearer credential returned exactly once by
 * `POST /admin/invites`; we turn it into the link the invitee must open
 * (`/admin/accept-invite?token=…`) and show it through SettingsOnceSecret.
 *
 * Revoking a *person's* access = better-auth's admin plugin (`ban-user`),
 * reached through `$adminFetch` like any other `/api/admin/**` call rather
 * than through the auth client — same 401/toast contract, no second HTTP
 * pathway to reason about. There is deliberately no "delete a staff member"
 * (audit says NON-MVP: that's an RGPD purge decision, not an API gap).
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()
const navItems = useSettingsNav()

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ users: AdminStaffUser[] }>('/api/admin/users')
const users = computed(() => data.value?.users ?? [])
const loading = computed(() => fetchStatus.value === 'pending')

const {
  data: inviteData,
  status: inviteStatus,
  refresh: refreshInvites,
} = useAdminFetch<{ invites: AdminInvite[] }>('/api/admin/invites')
const invites = computed(() => inviteData.value?.invites ?? [])
const invitesLoading = computed(() => inviteStatus.value === 'pending')

const { data: meData } = useAdminFetch<{ user: AdminStaffUser }>('/api/admin/users/me')
const meId = computed(() => meData.value?.user.id ?? null)

const userColumns = computed(() => [
  { key: 'name', label: t('setTeamColName') },
  { key: 'role', label: t('setTeamColRole') },
  { key: 'access', label: t('setTeamColAccess') },
])
const inviteColumns = computed(() => [
  { key: 'email', label: t('setInviteEmail') },
  { key: 'role', label: t('setInviteRole') },
  { key: 'status', label: t('labelStatus') },
])

const roleItems = computed(() => [
  { label: t('setRoleOwner'), value: 'owner' },
  { label: t('setRoleManager'), value: 'manager' },
  { label: t('setRoleFulfiller'), value: 'fulfiller' },
])

function roleHint(role: StaffRole): string {
  if (role === 'owner') return t('setRoleOwnerHint')
  if (role === 'manager') return t('setRoleManagerHint')
  return t('setRoleFulfillerHint')
}

// --- invite ------------------------------------------------------------------
const inviting = ref(false)
const saving = ref(false)
const draft = reactive({ email: '', role: 'manager' as StaffRole })
const inviteLink = ref<string | null>(null)

async function createInvite() {
  if (!draft.email.trim()) return
  saving.value = true
  try {
    const { invite } = await fetcher<{ invite: AdminInvite }>('/api/admin/invites', {
      method: 'POST',
      body: { email: draft.email.trim(), role: draft.role },
    })
    inviteLink.value = invite.token
      ? `${window.location.origin}/admin/accept-invite?token=${encodeURIComponent(invite.token)}`
      : null
    inviting.value = false
    draft.email = ''
    await refreshInvites()
  } finally {
    saving.value = false
  }
}

const inviteToRevoke = ref<AdminInvite | null>(null)
const revokingInvite = ref(false)

async function confirmRevokeInvite() {
  if (!inviteToRevoke.value) return
  revokingInvite.value = true
  try {
    await fetcher(`/api/admin/invites/${inviteToRevoke.value.id}`, { method: 'DELETE' })
    inviteToRevoke.value = null
    await refreshInvites()
  } finally {
    revokingInvite.value = false
  }
}

// --- block / unblock a person ---------------------------------------------------
const toBlock = ref<AdminStaffUser | null>(null)
const toUnblock = ref<AdminStaffUser | null>(null)
const blocking = ref(false)

async function confirmBlock() {
  if (!toBlock.value) return
  blocking.value = true
  try {
    await fetcher('/api/admin/auth/admin/ban-user', { method: 'POST', body: { userId: toBlock.value.id } })
    toBlock.value = null
    await refresh()
  } finally {
    blocking.value = false
  }
}

async function confirmUnblock() {
  if (!toUnblock.value) return
  blocking.value = true
  try {
    await fetcher('/api/admin/auth/admin/unban-user', { method: 'POST', body: { userId: toUnblock.value.id } })
    toUnblock.value = null
    await refresh()
  } finally {
    blocking.value = false
  }
}
</script>

<template>
  <PygPage :title="t('setTeamTitle')" :description="t('setTeamSubtitle')">
    <template #actions>
      <UButton icon="i-lucide-user-plus" size="md" :label="t('setInviteNew')" @click="inviting = true" />
    </template>

    <PygSubNav :items="navItems" />

    <SettingsOnceSecret
      v-if="inviteLink"
      :title="t('setInviteLinkTitle')"
      :description="t('setInviteLinkDescription')"
      :value="inviteLink"
      :copy-label="t('setInviteCopyLink')"
      @close="inviteLink = null"
    />

    <UCard v-if="inviting">
      <PygForm
        :state="draft"
        :loading="saving"
        :submit-label="t('setInviteNew')"
        @submit="createInvite"
        @cancel="inviting = false; draft.email = ''"
      >
        <UFormField :label="t('setInviteEmail')" name="email" required>
          <UInput v-model="draft.email" type="email" size="md" class="w-full sm:max-w-md" autofocus />
        </UFormField>

        <UFormField :label="t('setInviteRole')" :description="roleHint(draft.role)" name="role" required>
          <USelect v-model="draft.role" :items="roleItems" value-key="value" size="md" class="w-full sm:max-w-md" />
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

    <template v-else>
      <div class="flex flex-col gap-3">
        <h2 class="text-lg font-bold text-highlighted">{{ t('setTeamMembers') }}</h2>

        <PygList :items="users" :columns="userColumns" :loading="loading">
          <template #cell-name="{ item }">
            <span class="font-semibold text-highlighted">{{ item.name || item.email }}</span>
            <span class="block text-xs text-muted truncate">{{ item.email }}</span>
            <UBadge v-if="item.id === meId" color="primary" variant="soft" size="sm" :label="t('setTeamYou')" class="mt-1" />
          </template>

          <template #cell-role="{ item }">
            <span class="text-sm text-default">{{ t(roleLabelKey(item.role)) }}</span>
          </template>

          <template #cell-access="{ item }">
            <PygStatus
              :tone="item.banned ? 'error' : 'success'"
              :label="item.banned ? t('setTeamAccessBlocked') : t('setTeamAccessOpen')"
              :icon="item.banned ? 'i-lucide-user-x' : 'i-lucide-user-check'"
            />
          </template>

          <template #actions="{ item }">
            <UButton
              v-if="item.id !== meId && !item.banned"
              icon="i-lucide-user-x"
              color="error"
              variant="ghost"
              square
              size="md"
              :aria-label="t('setTeamBlock')"
              @click="toBlock = item"
            />
            <UButton
              v-else-if="item.id !== meId"
              icon="i-lucide-user-check"
              color="neutral"
              variant="ghost"
              square
              size="md"
              :aria-label="t('setTeamUnblock')"
              @click="toUnblock = item"
            />
          </template>

          <template #empty>
            <PygEmptyState
              icon="i-lucide-users"
              :title="t('setTeamMembersEmptyTitle')"
              :description="t('setTeamMembersEmptyDescription')"
              :action-label="t('setInviteNew')"
              action-icon="i-lucide-user-plus"
              @action="inviting = true"
            />
          </template>
        </PygList>
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="text-lg font-bold text-highlighted">{{ t('setInvitesTitle') }}</h2>

        <PygList :items="invites" :columns="inviteColumns" :loading="invitesLoading">
          <template #cell-email="{ item }">
            <span class="font-semibold text-highlighted">{{ item.email }}</span>
          </template>

          <template #cell-role="{ item }">
            <span class="text-sm text-default">{{ t(roleLabelKey(item.role)) }}</span>
          </template>

          <template #cell-status="{ item }">
            <PygStatus :tone="inviteStatusDisplay(item).tone" :label="t(inviteStatusDisplay(item).key)" />
          </template>

          <template #actions="{ item }">
            <UButton
              v-if="!item.acceptedAt && !item.revokedAt"
              icon="i-lucide-x"
              color="error"
              variant="ghost"
              square
              size="md"
              :aria-label="t('setInviteRevokeAction')"
              @click="inviteToRevoke = item"
            />
          </template>

          <template #empty>
            <PygEmptyState
              icon="i-lucide-mail"
              :title="t('setInvitesEmptyTitle')"
              :description="t('setInvitesEmptyDescription')"
              :action-label="t('setInviteNew')"
              action-icon="i-lucide-user-plus"
              @action="inviting = true"
            />
          </template>
        </PygList>
      </div>
    </template>

    <PygConfirm
      :open="Boolean(inviteToRevoke)"
      :title="t('setRevokeInviteTitle')"
      :description="t('setRevokeInviteBody')"
      :confirm-label="t('setInviteRevokeAction')"
      :loading="revokingInvite"
      @update:open="(value) => { if (!value) inviteToRevoke = null }"
      @confirm="confirmRevokeInvite"
    />

    <PygConfirm
      :open="Boolean(toBlock)"
      :title="t('setBlockStaffTitle')"
      :description="t('setBlockStaffBody')"
      :confirm-label="t('setTeamBlock')"
      :loading="blocking"
      @update:open="(value) => { if (!value) toBlock = null }"
      @confirm="confirmBlock"
    />

    <PygConfirm
      :open="Boolean(toUnblock)"
      :title="t('setUnblockStaffTitle')"
      :description="t('setUnblockStaffBody')"
      :confirm-label="t('setTeamUnblock')"
      :danger="false"
      :loading="blocking"
      @update:open="(value) => { if (!value) toUnblock = null }"
      @confirm="confirmUnblock"
    />
  </PygPage>
</template>
