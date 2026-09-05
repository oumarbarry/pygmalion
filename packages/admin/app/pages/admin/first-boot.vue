<script setup lang="ts">
// Consumes POST /api/admin/auth-bootstrap (packages/nuxt — not touched here).
// That endpoint has no companion "is bootstrap needed?" GET, so we attempt
// it directly and read its 403 ("already bootstrapped") to redirect to
// ponytail: sign-in instead of guessing state up front (no speculative
// pre-check; add one if/when that GET endpoint exists).
definePageMeta({ layout: 'admin-auth' })

const { t } = useVocabulary()

const state = reactive({ name: '', email: '', password: '' })
const loading = ref(false)
const error = ref<string | null>(null)
const alreadyBootstrapped = ref(false)

async function onSubmit(data: Record<string, unknown>) {
  loading.value = true
  error.value = null
  try {
    await $fetch('/api/admin/auth-bootstrap', {
      method: 'POST',
      body: { name: data.name, email: data.email, password: data.password },
    })
    const result = await signInWithPassword(String(data.email ?? ''), String(data.password ?? ''))
    if (result.error) {
      error.value = result.error.message ?? t('errorGeneric')
      return
    }
    await navigateTo('/admin')
  } catch (err: unknown) {
    const status = (err as { statusCode?: number; status?: number; response?: { status?: number } } | undefined)
    const code = status?.statusCode ?? status?.status ?? status?.response?.status
    if (code === 403) {
      alreadyBootstrapped.value = true
    } else {
      error.value = t('errorGeneric')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <template v-if="alreadyBootstrapped">
      <UAlert color="info" variant="soft" icon="i-lucide-info" :title="t('firstBootAlreadyDone')" />
      <UButton :label="t('signIn')" to="/admin/sign-in" color="primary" block size="md" class="mt-4" />
    </template>
    <template v-else>
      <h1 class="text-xl font-bold text-highlighted mb-1">{{ t('firstBootTitle') }}</h1>
      <p class="text-sm text-muted mb-6">{{ t('firstBootSubtitle') }}</p>

      <PygForm
        :state="state"
        :loading="loading"
        :error="error"
        :submit-label="t('firstBootAction')"
        :show-cancel="false"
        @submit="onSubmit"
      >
        <UFormField :label="t('name')" name="name" required>
          <UInput v-model="state.name" size="md" class="w-full" />
        </UFormField>
        <UFormField :label="t('email')" name="email" required>
          <UInput v-model="state.email" type="email" autocomplete="email" size="md" class="w-full" />
        </UFormField>
        <UFormField :label="t('password')" name="password" required>
          <UInput v-model="state.password" type="password" autocomplete="new-password" size="md" class="w-full" />
        </UFormField>
      </PygForm>
    </template>
  </div>
</template>
