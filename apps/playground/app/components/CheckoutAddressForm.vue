<script setup lang="ts">
import type { CartAddressInput, CustomerAddress } from '@oumarbarry/pygmalion-core'

/**
 * The shipping address. Also the form the account page reuses, so the field
 * set is the API's, not the checkout's.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: CartAddressInput
    /** Saved addresses to pick from — signed-in shoppers shouldn't retype. */
    saved?: CustomerAddress[]
    /** The region's own countries: `{ code: 'fr', label: 'France' }`. */
    countries?: { code: string; label: string }[]
    busy?: boolean
    submitLabel?: string
  }>(),
  { saved: () => [], countries: () => [] },
)
const { t } = useShopText()

const emit = defineEmits<{ submit: [address: CartAddressInput] }>()

const form = reactive<CartAddressInput>({
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  postalCode: '',
  city: '',
  countryCode: '',
  phone: '',
  ...props.modelValue,
})

// A country list narrower than the world: the region's own, so a shopper can't
// pick a destination no shipping option covers.
const countryItems = computed(() => props.countries.map((c) => ({ value: c.code, label: c.label })))
watchEffect(() => {
  if (!form.countryCode && countryItems.value.length) form.countryCode = countryItems.value[0].value
})

const savedItems = computed(() =>
  props.saved.map((a) => ({
    value: a.id,
    label: [a.addressName, a.address1, a.city].filter(Boolean).join(' · ') || t('checkoutSavedAddress'),
  })),
)

function useSaved(id: string) {
  const a = props.saved.find((s) => s.id === id)
  if (!a) return
  Object.assign(form, {
    firstName: a.firstName ?? '',
    lastName: a.lastName ?? '',
    address1: a.address1 ?? '',
    address2: a.address2 ?? '',
    postalCode: a.postalCode ?? '',
    city: a.city ?? '',
    countryCode: a.countryCode?.toLowerCase() ?? form.countryCode,
    phone: a.phone ?? '',
  })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="emit('submit', { ...form })">
    <UFormField v-if="savedItems.length" :label="t('checkoutSavedAddresses')">
      <USelect
        :items="savedItems"
        :placeholder="t('checkoutUseSaved')"
        class="w-full"
        @update:model-value="useSaved(String($event))"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('commonFirstName')" required>
        <UInput v-model="form.firstName" autocomplete="given-name" required class="w-full" />
      </UFormField>
      <UFormField :label="t('commonLastName')" required>
        <UInput v-model="form.lastName" autocomplete="family-name" required class="w-full" />
      </UFormField>
    </div>

    <UFormField :label="t('commonAddress')" required>
      <UInput v-model="form.address1" autocomplete="address-line1" required class="w-full" data-testid="address1" />
    </UFormField>
    <UFormField :label="t('commonAddressLine2')" :hint="t('commonOptional')">
      <UInput v-model="form.address2" autocomplete="address-line2" class="w-full" />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
      <UFormField :label="t('commonPostalCode')" required>
        <UInput v-model="form.postalCode" autocomplete="postal-code" required class="w-full" />
      </UFormField>
      <UFormField :label="t('commonCity')" required>
        <UInput v-model="form.city" autocomplete="address-level2" required class="w-full" data-testid="city" />
      </UFormField>
    </div>

    <UFormField :label="t('commonCountry')" required>
      <USelect v-model="form.countryCode" :items="countryItems" class="w-full" data-testid="country" />
    </UFormField>

    <UFormField :label="t('commonPhone')" :hint="t('checkoutPhoneHint')">
      <UInput v-model="form.phone" type="tel" autocomplete="tel" class="w-full" />
    </UFormField>

    <UButton
      type="submit"
      size="lg"
      color="primary"
      class="w-full sm:w-auto"
      :loading="busy"
      :label="submitLabel ?? t('commonContinue')"
      data-testid="address-submit"
    />
  </form>
</template>
