<script setup lang="ts">
definePageMeta({ layout: 'account', middleware: 'customer' })

const client = usePygmalion()
const route = useRoute()
const { t, tf } = useShopText()
const id = computed(() => String(route.params.id))

// No `?email=`: the session is the proof of ownership here.
const { data, pending, error, refresh } = await useAsyncData(
  () => `account:order:${id.value}`,
  () => client.store.orders.get(id.value),
  { watch: [id] },
)

useSeoMeta({ title: () => (data.value ? tf('orderNumberTitle', { id: data.value.order.displayId }) : t('orderFallbackTitle')) })
</script>

<template>
  <section>
    <NuxtLink to="/account/orders" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-highlighted">
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      {{ t('accountOrders') }}
    </NuxtLink>

    <AsyncState
      class="mt-6"
      :pending="pending"
      :error="isNotFound(error) ? null : error"
      :empty="!data"
      :empty-title="t('orderNotFoundTitle')"
      :empty-message="t('orderNotFoundAccountMessage')"
      @retry="refresh()"
    >
      <OrderView v-if="data" :order="data.order" show-return @returned="refresh()" />
    </AsyncState>
  </section>
</template>
