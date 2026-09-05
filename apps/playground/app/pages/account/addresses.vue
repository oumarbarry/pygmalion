<script setup lang="ts">
import type { CreateCustomerAddressInput, CustomerAddress } from '@oumarbarry/pygmalion-core'

definePageMeta({ layout: 'account', middleware: 'customer' })

const { addresses, refreshAddresses, addAddress, updateAddress, removeAddress } = useCustomer()
const { t } = useShopText()
useSeoMeta({ title: () => t('accountAddresses') })

await useAsyncData('account:addresses', () => refreshAddresses())

/** `null` = closed, `'new'` = creating, otherwise the id being edited. */
const editing = ref<string | null>(null)
const busy = ref(false)
const error = ref('')
const confirmingDelete = ref<string | null>(null)

const blank = (): CreateCustomerAddressInput => ({
  addressName: '',
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  postalCode: '',
  city: '',
  countryCode: 'FR',
  phone: '',
})
const form = reactive<CreateCustomerAddressInput>(blank())

function open(address?: CustomerAddress) {
  error.value = ''
  Object.assign(form, blank(), address ? { ...address } : {})
  editing.value = address?.id ?? 'new'
}

async function save() {
  busy.value = true
  error.value = ''
  try {
    const body = { ...form, countryCode: form.countryCode ? String(form.countryCode).toUpperCase() : null }
    if (editing.value === 'new') await addAddress(body)
    else await updateAddress(editing.value!, body)
    editing.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function destroy(id: string) {
  busy.value = true
  try {
    await removeAddress(id)
    confirmingDelete.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

const lines = (a: CustomerAddress) =>
  [
    [a.firstName, a.lastName].filter(Boolean).join(' '),
    a.address1,
    a.address2,
    [a.postalCode, a.city].filter(Boolean).join(' '),
    a.countryCode,
  ].filter(Boolean)
</script>

<template>
  <section>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-bold text-highlighted">{{ t('accountAddresses') }}</h2>
      <UButton
        v-if="editing !== 'new'"
        color="primary"
        size="sm"
        class="min-h-11"
        icon="i-lucide-plus"
        :label="t('commonAdd')"
        data-testid="add-address"
        @click="open()"
      />
    </div>

    <p v-if="error" class="mt-4 text-sm text-error" role="alert" data-testid="address-error">{{ error }}</p>

    <!-- Form: creating, or editing one entry in place. -->
    <form v-if="editing" class="mt-6 space-y-4 rounded-xl border border-default p-5" @submit.prevent="save">
      <UFormField :label="t('accountAddressName')" :hint="t('accountAddressNameHint')">
        <UInput v-model="form.addressName" class="w-full" data-testid="address-name" />
      </UFormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('commonFirstName')"><UInput v-model="form.firstName" autocomplete="given-name" class="w-full" /></UFormField>
        <UFormField :label="t('commonLastName')"><UInput v-model="form.lastName" autocomplete="family-name" class="w-full" /></UFormField>
      </div>
      <UFormField :label="t('commonAddress')" required>
        <UInput v-model="form.address1" autocomplete="address-line1" required class="w-full" data-testid="address-line1" />
      </UFormField>
      <UFormField :label="t('commonAddressLine2')"><UInput v-model="form.address2" class="w-full" /></UFormField>
      <div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <UFormField :label="t('commonPostalCode')"><UInput v-model="form.postalCode" autocomplete="postal-code" class="w-full" /></UFormField>
        <UFormField :label="t('commonCity')" required>
          <UInput v-model="form.city" autocomplete="address-level2" required class="w-full" data-testid="address-city" />
        </UFormField>
      </div>
      <UFormField :label="t('commonCountry')" :hint="t('accountCountryHint')" required>
        <UInput v-model="form.countryCode" maxlength="2" required class="w-full sm:max-w-24" data-testid="address-country" />
      </UFormField>
      <UFormField :label="t('commonPhone')"><UInput v-model="form.phone" type="tel" autocomplete="tel" class="w-full sm:max-w-xs" /></UFormField>

      <div class="flex gap-2">
        <UButton type="submit" color="primary" :loading="busy" :label="t('commonSave')" data-testid="save-address" />
        <UButton color="neutral" variant="ghost" :label="t('commonCancel')" @click="editing = null" />
      </div>
    </form>

    <AsyncState
      class="mt-6"
      :empty="!addresses.length && !editing"
      :empty-title="t('accountNoAddressTitle')"
      :empty-message="t('accountNoAddressMessage')"
      empty-icon="i-lucide-map-pin"
    >
      <ul class="mt-6 grid gap-4 sm:grid-cols-2">
        <li v-for="a in addresses" :key="a.id" class="rounded-xl border border-default p-5" data-testid="address-card">
          <p v-if="a.addressName" class="font-semibold text-highlighted">{{ a.addressName }}</p>
          <address class="mt-1 text-sm not-italic leading-relaxed text-muted">
            <span v-for="line in lines(a)" :key="line" class="block">{{ line }}</span>
          </address>

          <div v-if="confirmingDelete === a.id" class="mt-4 rounded-lg bg-muted p-3">
            <p class="text-sm text-highlighted">{{ t('accountDeleteAddress') }}</p>
            <div class="mt-2.5 flex gap-2">
              <UButton size="sm" class="min-h-11" color="error" :loading="busy" :label="t('commonDelete')" data-testid="confirm-delete" @click="destroy(a.id)" />
              <UButton size="sm" class="min-h-11" color="neutral" variant="ghost" :label="t('commonCancel')" @click="confirmingDelete = null" />
            </div>
          </div>
          <div v-else class="mt-4 flex gap-2">
            <UButton size="sm" class="min-h-11" color="neutral" variant="outline" :label="t('commonEdit')" @click="open(a)" />
            <UButton size="sm" class="min-h-11" color="neutral" variant="ghost" :label="t('commonDelete')" @click="confirmingDelete = a.id" />
          </div>
        </li>
      </ul>
    </AsyncState>
  </section>
</template>
