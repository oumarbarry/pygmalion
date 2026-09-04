<script setup lang="ts">
// Guest order lookup: number + the e-mail that placed it, which is exactly the
// ownership rule `GET /api/store/orders/:id` enforces.
useSeoMeta({ title: 'Suivre une commande' })

const id = ref('')
const email = ref('')

const submit = () =>
  navigateTo({ path: `/order/${id.value.trim()}`, query: { email: email.value.trim() || undefined } })
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-14 sm:px-6">
    <h1 class="shop-display text-3xl text-highlighted">Suivre une commande</h1>
    <p class="mt-2 text-muted">
      Le numéro figure dans votre e-mail de confirmation. Pas besoin de compte.
    </p>

    <form class="mt-8 space-y-4" @submit.prevent="submit">
      <UFormField label="Numéro de commande" required>
        <UInput v-model="id" placeholder="ord_…" required class="w-full" />
      </UFormField>
      <UFormField label="E-mail utilisé pour la commande" required>
        <UInput v-model="email" type="email" autocomplete="email" required class="w-full" />
      </UFormField>
      <UButton type="submit" size="lg" block color="primary" label="Voir ma commande" />
    </form>

    <p class="mt-6 text-center text-sm text-muted">
      Vous avez un compte ?
      <NuxtLink to="/account/login" class="underline underline-offset-2 hover:text-highlighted">Connectez-vous</NuxtLink>
      pour retrouver tout l'historique.
    </p>
  </div>
</template>
