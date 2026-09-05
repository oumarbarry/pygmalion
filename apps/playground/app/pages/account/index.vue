<script setup lang="ts">
definePageMeta({ layout: 'account', middleware: 'customer' })

const client = usePygmalion()
const { customer, update } = useCustomer()
const { t } = useShopText()

useSeoMeta({ title: () => t('accountTitle') })

const { data, pending, error, refresh } = await useAsyncData('account:recent', () =>
  client.store.orders.list({ limit: 3 }),
)
const recent = computed(() => data.value?.orders ?? [])

const name = ref(customer.value?.name ?? '')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')

async function save() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  try {
    await update({ name: name.value })
    saved.value = true
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-12">
    <section>
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="text-lg font-bold text-highlighted">{{ t('accountRecentOrders') }}</h2>
        <NuxtLink to="/account/orders" class="text-sm text-muted underline-offset-4 hover:text-highlighted hover:underline">
          {{ t('commonSeeAll') }}
        </NuxtLink>
      </div>

      <AsyncState
        class="mt-4"
        :pending="pending"
        :error="error"
        :empty="!recent.length"
        :empty-title="t('accountNoOrdersTitle')"
        :empty-message="t('accountNoOrdersMessage')"
        empty-icon="i-lucide-package"
        @retry="refresh()"
      >
        <template #empty-action>
          <UButton to="/products" class="mt-5" color="primary" :label="t('commonBrowseShop')" />
        </template>
        <ul class="divide-y divide-default border-y border-default">
          <AccountOrderRow v-for="o in recent" :key="o.id" :order="o" />
        </ul>
      </AsyncState>
    </section>

    <section>
      <h2 class="text-lg font-bold text-highlighted">{{ t('accountDetails') }}</h2>
      <form class="mt-4 max-w-sm space-y-4" @submit.prevent="save">
        <UFormField :label="t('commonName')">
          <UInput v-model="name" autocomplete="name" class="w-full" data-testid="profile-name" />
        </UFormField>
        <!-- `readonly`, not `disabled`: the address is still information the
             customer must be able to read and copy, and the layer renders a
             disabled control at 50 % opacity — under AA (§S8.2). -->
        <UFormField :label="t('commonEmail')" :hint="t('accountEmailHint')">
          <UInput :model-value="customer?.email" readonly class="w-full" />
        </UFormField>
        <p v-if="saveError" class="text-sm text-error" role="alert">{{ saveError }}</p>
        <p v-else-if="saved" class="text-sm text-success" role="status">{{ t('commonSaved') }}</p>
        <UButton type="submit" color="primary" :loading="saving" :label="t('commonSave')" />
      </form>
    </section>
  </div>
</template>
