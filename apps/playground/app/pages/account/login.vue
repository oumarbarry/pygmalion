<script setup lang="ts">
/**
 * Sign in / create an account, one screen, one toggle.
 *
 * On success the guest cart is bound to the account (`attachCustomer`) before
 * anything else: a shopper who signs in mid-checkout must not lose the basket,
 * and the order they place next has to land under their account.
 */
const route = useRoute()
const { signIn, signUp, isAuthenticated } = useCustomer()
const { attachCustomer, cartId } = useShop()
const { t } = useShopText()

useSeoMeta({ title: () => t('accountSignIn') })

const mode = ref<'signin' | 'signup'>(route.query.mode === 'signup' ? 'signup' : 'signin')
const email = ref('')
const password = ref('')
const name = ref('')
const busy = ref(false)
const error = ref('')

const redirect = computed(() => String(route.query.redirect ?? '/account'))

onMounted(() => {
  if (isAuthenticated.value) navigateTo(redirect.value)
})

async function submit() {
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'signup') await signUp({ email: email.value, password: password.value, name: name.value || undefined })
    else await signIn({ email: email.value, password: password.value })
    if (cartId.value) await attachCustomer().catch(() => null)
    await navigateTo(redirect.value)
  } catch (err) {
    error.value =
      err instanceof Error && /invalid|credential|password/i.test(err.message)
        ? t('accountBadCredentials')
        : err instanceof Error
          ? err.message
          : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-14 sm:px-6">
    <h1 class="shop-display text-3xl text-highlighted">
      {{ t(mode === 'signin' ? 'accountSignIn' : 'accountCreate') }}
    </h1>
    <p class="mt-2 text-muted">
      {{ t(mode === 'signin' ? 'accountSignInText' : 'accountSignUpText') }}
    </p>

    <form class="mt-8 space-y-4" @submit.prevent="submit">
      <UFormField v-if="mode === 'signup'" :label="t('commonName')">
        <UInput v-model="name" autocomplete="name" class="w-full" data-testid="signup-name" />
      </UFormField>
      <UFormField :label="t('commonEmail')" required>
        <UInput v-model="email" type="email" autocomplete="email" required class="w-full" data-testid="auth-email" />
      </UFormField>
      <UFormField :label="t('commonPassword')" required :hint="mode === 'signup' ? t('accountPasswordHint') : undefined">
        <UInput
          v-model="password"
          type="password"
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          required
          minlength="8"
          class="w-full"
          data-testid="auth-password"
        />
      </UFormField>

      <p v-if="error" class="text-sm text-error" role="alert" data-testid="auth-error">{{ error }}</p>

      <UButton
        type="submit"
        size="lg"
        block
        color="primary"
        :loading="busy"
        :label="t(mode === 'signin' ? 'accountSignIn' : 'accountCreateMine')"
        data-testid="auth-submit"
      />
    </form>

    <p class="mt-6 text-center text-sm text-muted">
      {{ t(mode === 'signin' ? 'accountNoAccount' : 'accountHaveAccount') }}
      <button
        type="button"
        class="underline underline-offset-2 hover:text-highlighted"
        data-testid="auth-toggle"
        @click="mode = mode === 'signin' ? 'signup' : 'signin'"
      >
        {{ t(mode === 'signin' ? 'accountCreate' : 'accountSignIn') }}
      </button>
    </p>
    <p class="mt-3 text-center text-sm text-dimmed">
      {{ t('accountGuestOrder') }}
      <NuxtLink to="/order" class="underline underline-offset-2 hover:text-muted">{{ t('accountTrackByEmail') }}</NuxtLink>.
    </p>
  </div>
</template>
