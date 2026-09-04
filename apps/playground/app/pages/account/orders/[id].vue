<script setup lang="ts">
definePageMeta({ layout: 'account', middleware: 'customer' })

const client = usePygmalion()
const route = useRoute()
const id = computed(() => String(route.params.id))

// No `?email=`: the session is the proof of ownership here.
const { data, pending, error, refresh } = await useAsyncData(
  () => `account:order:${id.value}`,
  () => client.store.orders.get(id.value),
  { watch: [id] },
)

useSeoMeta({ title: () => (data.value ? `Commande n° ${data.value.order.displayId}` : 'Commande') })
</script>

<template>
  <section>
    <NuxtLink to="/account/orders" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-highlighted">
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      Mes commandes
    </NuxtLink>

    <AsyncState
      class="mt-6"
      :pending="pending"
      :error="isNotFound(error) ? null : error"
      :empty="!data"
      empty-title="Commande introuvable"
      empty-message="Elle a peut-être été passée avec une autre adresse e-mail."
      @retry="refresh()"
    >
      <OrderView v-if="data" :order="data.order" show-return @returned="refresh()" />
    </AsyncState>
  </section>
</template>
