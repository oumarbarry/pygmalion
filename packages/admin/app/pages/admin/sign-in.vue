<script setup lang="ts">
definePageMeta({ layout: 'admin-auth' })

const { t } = useVocabulary()
const route = useRoute()

const state = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref<string | null>(null)

async function onSubmit(data: Record<string, unknown>) {
  loading.value = true
  error.value = null
  try {
    const result = await signInWithPassword(String(data.email ?? ''), String(data.password ?? ''))
    if (result.error) {
      // better-auth answers in English with its own wording ("Invalid email or
      // password"). The merchant never reads the server's
      // words. 401/403 is the only failure a wrong form can produce here;
      // anything else is the generic message.
      const status = result.error.status
      error.value = status === 401 || status === 403
        ? t('signInBadCredentials')
        : t('errorGeneric')
      return
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/admin'
    await navigateTo(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-bold text-highlighted mb-1">{{ t('signInTitle') }}</h1>
    <p class="text-sm text-muted mb-6">{{ t('signInSubtitle') }}</p>

    <PygForm
      :state="state"
      :loading="loading"
      :error="error"
      :submit-label="t('signIn')"
      :show-cancel="false"
      @submit="onSubmit"
    >
      <UFormField :label="t('email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" size="md" class="w-full" />
      </UFormField>
      <UFormField :label="t('password')" name="password" required>
        <UInput v-model="state.password" type="password" autocomplete="current-password" size="md" class="w-full" />
      </UFormField>
    </PygForm>

    <p class="text-center text-sm text-muted mt-6">
      <NuxtLink to="/admin/first-boot" class="text-primary font-semibold hover:underline">{{ t('firstBootTitle') }}</NuxtLink>
    </p>
  </div>
</template>
