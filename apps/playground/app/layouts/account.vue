<script setup lang="ts">
// Same shell as the shop (header, footer, cart drawer) plus the account's own
// side nav — a customer is still shopping while they read their orders.
const { customer, signOut } = useCustomer()

async function leave() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <NuxtLayout name="default">
    <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header class="border-b border-default pb-6">
        <h1 class="shop-display text-3xl text-highlighted sm:text-4xl">Mon compte</h1>
        <p v-if="customer" class="mt-2 text-muted" data-testid="account-email">
          {{ customer.name || customer.email }}
        </p>
      </header>

      <div class="mt-8 grid gap-8 sm:grid-cols-[13rem_1fr] sm:gap-12">
        <AccountNav @sign-out="leave" />
        <div class="min-w-0">
          <slot />
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
