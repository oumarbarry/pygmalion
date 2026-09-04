<script setup lang="ts">
definePageMeta({ layout: 'account', middleware: 'customer' })

const client = usePygmalion()
useSeoMeta({ title: 'Mes commandes' })

const { data, pending, error, refresh } = await useAsyncData('account:orders', () =>
  client.store.orders.list({ limit: 50 }),
)
const orders = computed(() => data.value?.orders ?? [])
</script>

<template>
  <section>
    <h2 class="text-lg font-bold text-highlighted">Mes commandes</h2>

    <AsyncState
      class="mt-4"
      :pending="pending"
      :error="error"
      :empty="!orders.length"
      empty-title="Aucune commande pour l'instant"
      empty-message="Vos achats apparaîtront ici dès la première commande."
      empty-icon="i-lucide-package"
      @retry="refresh()"
    >
      <template #empty-action>
        <UButton to="/products" class="mt-5" color="primary" label="Voir la boutique" />
      </template>

      <ul class="divide-y divide-default border-y border-default">
        <AccountOrderRow v-for="o in orders" :key="o.id" :order="o" />
      </ul>
    </AsyncState>
  </section>
</template>
