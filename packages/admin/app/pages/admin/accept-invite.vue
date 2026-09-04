<script setup lang="ts">
// Consumes POST /api/admin/invites/accept?token=... (packages/nuxt, unchanged).
definePageMeta({ layout: 'admin-auth' })

const { t } = useVocabulary()
const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))

const state = reactive({ name: '', password: '' })
const loading = ref(false)
const error = ref<string | null>(null)

async function onSubmit(data: Record<string, unknown>) {
  loading.value = true
  error.value = null
  try {
    await $fetch('/api/admin/invites/accept', {
      method: 'POST',
      body: { token: token.value, name: data.name, password: data.password },
    })
    await navigateTo('/admin/sign-in')
  } catch {
    error.value = t('errorGeneric')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-bold text-highlighted mb-1">{{ t('acceptInviteTitle') }}</h1>
    <p class="text-sm text-muted mb-6">{{ t('acceptInviteSubtitle') }}</p>

    <UAlert
      v-if="!token"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorGeneric')"
      class="mb-4"
    />

    <PygForm
      :state="state"
      :loading="loading"
      :error="error"
      :submit-label="t('acceptInviteAction')"
      :show-cancel="false"
      @submit="onSubmit"
    >
      <UFormField :label="t('name')" name="name" required>
        <UInput v-model="state.name" size="md" class="w-full" />
      </UFormField>
      <UFormField :label="t('password')" name="password" required>
        <UInput v-model="state.password" type="password" autocomplete="new-password" size="md" class="w-full" />
      </UFormField>
    </PygForm>
  </div>
</template>
