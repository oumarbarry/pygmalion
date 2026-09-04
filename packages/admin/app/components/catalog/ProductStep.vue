<script setup lang="ts">
/**
 * One question of the product wizard. Rendered twice from the same source:
 * inside `PygWizard`'s `#step-<key>` slot (guided, the default) and stacked
 * in the « formulaire complet » mode. Domain component, not a base one,
 * hence the `catalog/` folder rather than a `Pyg` prefix.
 *
 * Mutates the shared reactive `draft` directly — it is the wizard's single
 * piece of state and passing 12 v-models instead would buy nothing.
 */
const props = defineProps<{
  step: 'infos' | 'photos' | 'variants' | 'prices' | 'stock' | 'channels'
  draft: ProductDraft
  currencies: string[]
  channels: AdminSalesChannel[]
  locations: AdminStockLocation[]
}>()

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()

const combos = computed(() => combineOptionValues(
  props.draft.hasVariants
    ? props.draft.options.map((o) => ({ title: o.title.trim(), values: parseOptionValues(o.valuesInput) }))
    : [],
))
const comboKey = (values: string[]) => values.join(' / ')
const comboLabel = (values: string[]) => variantTitle(values, props.draft.title || t('productName'))

// --- photos -----------------------------------------------------------------
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const uploading = ref(false)

async function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploading.value = true
  try {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    const result = await $adminFetch<{ files: { id: string; url: string }[] }>('/api/admin/uploads', {
      method: 'POST',
      body: form,
    })
    props.draft.photos.push(...result.files)
  } finally {
    uploading.value = false
    input.value = ''
  }
}

// --- déclinaisons -----------------------------------------------------------
function addOption() {
  props.draft.options.push({ title: '', valuesInput: '' })
}

function removeOption(index: number) {
  props.draft.options.splice(index, 1)
  if (!props.draft.options.length) props.draft.options.push({ title: '', valuesInput: '' })
}

// Suggested référence, refreshed whenever the combinations change — a merchant
// who never touches it still gets stock countable per déclinaison.
watch(
  [combos, () => props.draft.title],
  ([list, title]) => {
    for (const values of list) {
      const key = comboKey(values)
      if (!props.draft.references[key]) props.draft.references[key] = suggestReference(title || 'produit', values)
    }
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <!-- 1. The product -->
  <div v-if="step === 'infos'" class="flex flex-col gap-5">
    <UFormField :label="t('productName')" name="title" required>
      <UInput v-model="draft.title" size="md" class="w-full" autofocus />
    </UFormField>
    <UFormField :label="t('productDescription')" name="description" :hint="t('optional')">
      <UTextarea v-model="draft.description" :rows="4" class="w-full" />
    </UFormField>
    <USwitch v-model="draft.isGiftcard" :label="t('giftcard')" :description="t('giftcardHint')" />
  </div>

  <!-- 2. Photos -->
  <div v-else-if="step === 'photos'" class="flex flex-col gap-4">
    <p class="text-sm text-muted">{{ t('addPhotosHint') }}</p>

    <ul v-if="draft.photos.length" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <li v-for="(photo, index) in draft.photos" :key="photo.id" class="relative">
        <img :src="photo.url" alt="" class="aspect-square w-full rounded-xl object-cover bg-muted">
        <UButton
          icon="i-lucide-x"
          color="error"
          variant="solid"
          square
          size="sm"
          class="absolute top-1 end-1"
          :aria-label="t('remove')"
          @click="draft.photos.splice(index, 1)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-dimmed">{{ t('noPhotosYet') }}</p>

    <div>
      <input ref="fileInput" type="file" accept="image/*" multiple class="sr-only" @change="onFilesPicked">
      <UButton
        icon="i-lucide-image-plus"
        color="primary"
        variant="soft"
        size="lg"
        :loading="uploading"
        :label="uploading ? t('uploading') : t('addPhotos')"
        @click="fileInput?.click()"
      />
    </div>
  </div>

  <!-- 3. Variants (déclinaisons) -->
  <div v-else-if="step === 'variants'" class="flex flex-col gap-5">
    <fieldset class="flex flex-col gap-2">
      <legend class="text-sm font-semibold text-highlighted mb-2">{{ t('variantsQuestion') }}</legend>
      <label
        v-for="choice in [{ value: false, label: t('variantsNoAnswer') }, { value: true, label: t('variantsYesAnswer') }]"
        :key="String(choice.value)"
        class="pyg-tap-target flex items-center gap-3 rounded-xl border px-4 cursor-pointer transition-colors"
        :class="draft.hasVariants === choice.value ? 'border-primary bg-primary/5 text-primary' : 'border-default hover:bg-muted'"
      >
        <input v-model="draft.hasVariants" type="radio" :value="choice.value" class="size-4 accent-current">
        <span class="text-sm font-semibold">{{ choice.label }}</span>
      </label>
    </fieldset>

    <template v-if="draft.hasVariants">
      <div v-for="(option, index) in draft.options" :key="index" class="flex flex-col sm:flex-row gap-3 sm:items-end">
        <UFormField :label="t('optionTitleLabel')" :name="`option-${index}-title`" class="flex-1">
          <UInput v-model="option.title" size="md" class="w-full" :placeholder="t('optionTitlePlaceholder')" />
        </UFormField>
        <UFormField :label="t('optionValuesLabel')" :name="`option-${index}-values`" class="flex-1">
          <UInput v-model="option.valuesInput" size="md" class="w-full" :placeholder="t('optionValuesPlaceholder')" />
        </UFormField>
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          square
          size="md"
          :aria-label="t('remove')"
          @click="removeOption(index)"
        />
      </div>
      <div>
        <UButton icon="i-lucide-plus" color="neutral" variant="outline" size="md" :label="t('addOption')" @click="addOption" />
      </div>
    </template>

    <div v-if="combos.length" class="flex flex-col gap-2">
      <p class="text-sm font-semibold text-highlighted">{{ t('generatedVariants') }}</p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="values in combos"
          :key="comboKey(values)"
          class="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-default p-3"
        >
          <span class="flex-1 text-sm font-semibold text-highlighted">{{ comboLabel(values) }}</span>
          <UFormField :label="t('sku')" :name="`ref-${comboKey(values)}`" :hint="t('optional')" class="sm:w-64">
            <UInput v-model="draft.references[comboKey(values)]" size="md" class="w-full" />
          </UFormField>
        </li>
      </ul>
    </div>
  </div>

  <!-- 4. Price -->
  <div v-else-if="step === 'prices'" class="flex flex-col gap-5">
    <PygEmptyState
      v-if="!currencies.length"
      icon="i-lucide-coins"
      :title="t('noCurrencyTitle')"
      :description="t('noCurrencyDescription')"
    />
    <template v-else>
      <USwitch v-if="combos.length > 1" v-model="draft.samePriceForAll" :label="t('samePriceForAll')" />

      <div v-if="draft.samePriceForAll || combos.length <= 1" class="flex flex-col sm:flex-row gap-3">
        <UFormField v-for="currency in currencies" :key="currency" :label="`${t('priceLabel')} (${currency.toUpperCase()})`" :name="`price-${currency}`" class="sm:w-56">
          <UInput v-model="draft.prices[currency]" size="md" class="w-full" inputmode="decimal" placeholder="0" />
        </UFormField>
      </div>

      <ul v-else class="flex flex-col gap-3">
        <li v-for="values in combos" :key="comboKey(values)" class="rounded-xl border border-default p-3 flex flex-col gap-3">
          <span class="text-sm font-semibold text-highlighted">{{ comboLabel(values) }}</span>
          <div class="flex flex-col sm:flex-row gap-3">
            <UFormField
              v-for="currency in currencies"
              :key="currency"
              :label="`${t('priceLabel')} (${currency.toUpperCase()})`"
              :name="`price-${comboKey(values)}-${currency}`"
              class="sm:w-56"
            >
              <UInput
                v-model="draft.variantPrices[`${comboKey(values)}|${currency}`]"
                size="md"
                class="w-full"
                inputmode="decimal"
                placeholder="0"
              />
            </UFormField>
          </div>
        </li>
      </ul>
    </template>
  </div>

  <!-- 5. Stock -->
  <div v-else-if="step === 'stock'" class="flex flex-col gap-5">
    <PygEmptyState
      v-if="!locations.length"
      icon="i-lucide-warehouse"
      :title="t('noStockLocationTitle')"
      :description="t('noStockLocationDescription')"
    />
    <template v-else>
      <UFormField v-if="locations.length > 1" :label="t('stockLocationLabel')" name="location" class="sm:w-72">
        <USelect
          v-model="draft.locationId"
          :items="locations.map((l) => ({ label: l.name, value: l.id }))"
          value-key="value"
          size="md"
          class="w-full"
        />
      </UFormField>

      <ul class="flex flex-col gap-2">
        <li
          v-for="values in combos"
          :key="comboKey(values)"
          class="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-default p-3"
        >
          <span class="flex-1 text-sm font-semibold text-highlighted">{{ comboLabel(values) }}</span>
          <UFormField :label="t('stockQuantityLabel')" :name="`stock-${comboKey(values)}`" class="sm:w-48">
            <UInput v-model="draft.stock[comboKey(values)]" size="md" class="w-full" inputmode="numeric" placeholder="0" />
          </UFormField>
        </li>
      </ul>
    </template>
  </div>

  <!-- 6. Where to sell it -->
  <div v-else class="flex flex-col gap-4">
    <PygEmptyState
      v-if="!channels.length"
      icon="i-lucide-store"
      :title="t('noChannelTitle')"
      :description="t('noChannelDescription')"
    />
    <template v-else>
      <p class="text-sm text-muted">{{ t('channelsQuestion') }}</p>
      <UCheckbox
        v-for="channel in channels"
        :key="channel.id"
        :model-value="draft.channelIds.includes(channel.id)"
        :label="channel.name"
        @update:model-value="(checked) => {
          if (checked) draft.channelIds.push(channel.id)
          else draft.channelIds.splice(draft.channelIds.indexOf(channel.id), 1)
        }"
      />
    </template>
  </div>
</template>
