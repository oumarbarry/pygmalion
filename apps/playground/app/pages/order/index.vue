<script setup lang="ts">
// Guest order lookup: number + the e-mail that placed it, which is exactly the
// ownership rule `GET /api/store/orders/:id` enforces.
const { t } = useShopText()
useSeoMeta({ title: () => t('orderTrack') })

const id = ref('')
const email = ref('')

const submit = () =>
  navigateTo({ path: `/order/${id.value.trim()}`, query: { email: email.value.trim() || undefined } })
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-14 sm:px-6">
    <h1 class="shop-display text-3xl text-highlighted">{{ t('orderTrack') }}</h1>
    <p class="mt-2 text-muted">
      {{ t('orderTrackText') }}
    </p>

    <form class="mt-8 space-y-4" @submit.prevent="submit">
      <UFormField :label="t('orderNumberField')" required>
        <UInput v-model="id" placeholder="ord_…" required class="w-full" />
      </UFormField>
      <UFormField :label="t('orderEmailField')" required>
        <UInput v-model="email" type="email" autocomplete="email" required class="w-full" />
      </UFormField>
      <UButton type="submit" size="lg" block color="primary" :label="t('orderSeeMine')" />
    </form>

    <p class="mt-6 text-center text-sm text-muted">
      {{ t('orderHaveAccount') }}
      <NuxtLink to="/account/login" class="underline underline-offset-2 hover:text-highlighted">{{ t('orderSignInLink') }}</NuxtLink>
      {{ t('orderSignInHint') }}
    </p>
  </div>
</template>
