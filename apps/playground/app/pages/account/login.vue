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

useSeoMeta({ title: 'Se connecter' })

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
        ? 'E-mail ou mot de passe incorrect.'
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
      {{ mode === 'signin' ? 'Se connecter' : 'Créer un compte' }}
    </h1>
    <p class="mt-2 text-muted">
      {{
        mode === 'signin'
          ? 'Pour retrouver vos commandes et vos adresses.'
          : 'Vos adresses enregistrées, vos commandes au même endroit.'
      }}
    </p>

    <form class="mt-8 space-y-4" @submit.prevent="submit">
      <UFormField v-if="mode === 'signup'" label="Nom">
        <UInput v-model="name" autocomplete="name" class="w-full" data-testid="signup-name" />
      </UFormField>
      <UFormField label="Adresse e-mail" required>
        <UInput v-model="email" type="email" autocomplete="email" required class="w-full" data-testid="auth-email" />
      </UFormField>
      <UFormField label="Mot de passe" required :hint="mode === 'signup' ? '8 caractères minimum' : undefined">
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
        :label="mode === 'signin' ? 'Se connecter' : 'Créer mon compte'"
        data-testid="auth-submit"
      />
    </form>

    <p class="mt-6 text-center text-sm text-muted">
      {{ mode === 'signin' ? 'Pas encore de compte ?' : 'Vous avez déjà un compte ?' }}
      <button
        type="button"
        class="underline underline-offset-2 hover:text-highlighted"
        data-testid="auth-toggle"
        @click="mode = mode === 'signin' ? 'signup' : 'signin'"
      >
        {{ mode === 'signin' ? 'Créer un compte' : 'Se connecter' }}
      </button>
    </p>
    <p class="mt-3 text-center text-sm text-dimmed">
      Commande passée sans compte ?
      <NuxtLink to="/order" class="underline underline-offset-2 hover:text-muted">Suivez-la par e-mail</NuxtLink>.
    </p>
  </div>
</template>
