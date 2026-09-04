<script setup lang="ts">
/**
 * Product creation. Guided wizard by default, one
 * question per screen, plain-language summary before anything is written; the
 * « formulaire complet » is one click away for power users but never the
 * default. Both modes render the exact same step bodies (CatalogProductStep).
 *
 * Nothing is written until « Mettre en vente » / « Garder en brouillon »: the
 * whole draft is committed in one ordered sequence of existing admin routes
 * (product -> images -> options -> variants -> prices -> stock -> channels).
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()

const draft = reactive(emptyProductDraft())
const mode = ref<'steps' | 'form'>('steps')
const stepIndex = ref(0)
const saving = ref(false)
const error = ref<string | null>(null)

const steps = computed(() => [
  { key: 'infos' as const, title: t('stepInfos'), description: t('stepInfosDescription') },
  { key: 'photos' as const, title: t('stepPhotos'), description: t('stepPhotosDescription') },
  { key: 'variants' as const, title: t('stepVariants'), description: t('stepVariantsDescription') },
  { key: 'prices' as const, title: t('stepPrices'), description: t('stepPricesDescription') },
  { key: 'stock' as const, title: t('stepStock'), description: t('stepStockDescription') },
  { key: 'channels' as const, title: t('stepChannels'), description: t('stepChannelsDescription') },
])

// Reference data the steps offer as choices.
const { data: regionData } = useAdminFetch<{ regions: AdminRegion[] }>('/api/admin/regions', { query: { limit: 100 } })
const { data: channelData } = useAdminFetch<{ salesChannels: AdminSalesChannel[] }>('/api/admin/sales-channels', {
  query: { limit: 100 },
})
const { data: locationData } = useAdminFetch<{ stockLocations: AdminStockLocation[] }>('/api/admin/stock-locations', {
  query: { limit: 100 },
})

const currencies = computed(() => [...new Set((regionData.value?.regions ?? []).map((r) => r.currencyCode))])
const channels = computed(() => (channelData.value?.salesChannels ?? []).filter((c) => !c.isDisabled))
const locations = computed(() => locationData.value?.stockLocations ?? [])

// Sensible defaults: sell everywhere, stock in the only place there is.
watch(channels, (list) => { if (!draft.channelIds.length) draft.channelIds = list.map((c) => c.id) })
watch(locations, (list) => { if (!draft.locationId && list.length) draft.locationId = list[0]!.id })

const combos = computed(() => combineOptionValues(
  draft.hasVariants ? draft.options.map((o) => ({ title: o.title.trim(), values: parseOptionValues(o.valuesInput) })) : [],
))
const comboKey = (values: string[]) => values.join(' / ')
const comboLabel = (values: string[]) => variantTitle(values, draft.title)

/** The amount typed for one déclinaison (keyed by its joined option values). */
function priceInput(key: string, currency: string): string {
  return (draft.samePriceForAll || combos.value.length <= 1
    ? draft.prices[currency]
    : draft.variantPrices[`${key}|${currency}`]) ?? ''
}

const canSubmit = computed(() => draft.title.trim().length > 0)
const totalStock = computed(() =>
  combos.value.reduce((sum, values) => sum + (Number.parseInt(draft.stock[comboKey(values)] ?? '', 10) || 0), 0),
)

async function submit(status: 'published' | 'draft') {
  if (!canSubmit.value) {
    error.value = t('productNameRequired')
    return
  }
  saving.value = true
  error.value = null
  let productId: string | null = null
  try {
    const { product } = await $adminFetch<{ product: AdminProduct }>('/api/admin/products', {
      method: 'POST',
      body: {
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        isGiftcard: draft.isGiftcard,
        status,
      },
    })
    productId = product.id

    if (draft.photos.length) {
      await $adminFetch(`/api/admin/products/${product.id}/images`, {
        method: 'POST',
        body: { images: draft.photos.map((photo) => ({ url: photo.url })) },
      })
    }

    // Options first: each POST returns its values (with ids), which is what a
    // variant needs to pin its combination.
    const valueIdByOptionValue = new Map<string, string>()
    if (draft.hasVariants) {
      for (const option of draft.options) {
        const values = parseOptionValues(option.valuesInput)
        if (!option.title.trim() || !values.length) continue
        const { option: created } = await $adminFetch<{ option: AdminProductOption }>(
          `/api/admin/products/${product.id}/options`,
          { method: 'POST', body: { title: option.title.trim(), values: values.map((value) => ({ value })) } },
        )
        for (const value of created.values) valueIdByOptionValue.set(`${created.title}|${value.value}`, value.id)
      }
    }

    const createdVariants: { key: string; id: string }[] = []
    for (const values of combos.value) {
      const key = comboKey(values)
      const optionValueIds = draft.hasVariants
        ? draft.options
            .map((option, index) => valueIdByOptionValue.get(`${option.title.trim()}|${values[index]}`))
            .filter((id): id is string => Boolean(id))
        : []
      const { variant } = await $adminFetch<{ variant: AdminProductVariant }>(
        `/api/admin/products/${product.id}/variants`,
        {
          method: 'POST',
          body: {
            title: comboLabel(values),
            sku: draft.references[key]?.trim() || undefined,
            ...(optionValueIds.length ? { optionValueIds } : {}),
          },
        },
      )
      createdVariants.push({ key, id: variant.id })
    }

    const priceRows = createdVariants.flatMap(({ key, id }) =>
      currencies.value.flatMap((currency) => {
        const amount = parseAmountToMinor(priceInput(key, currency), currency)
        return amount === null ? [] : [{ variantId: id, currencyCode: currency, amount }]
      }),
    )
    if (priceRows.length) {
      await $adminFetch('/api/admin/prices/batch', { method: 'POST', body: { create: priceRows } })
    }

    if (draft.locationId) {
      for (const { key, id } of createdVariants) {
        const quantity = Number.parseInt(draft.stock[key] ?? '', 10)
        const reference = draft.references[key]?.trim()
        if (!Number.isFinite(quantity) || quantity <= 0 || !reference) continue
        // A fresh variant has no inventory item yet (one is only auto-created
        // when a cart reserves it) — create it, link it, then count it.
        const { inventoryItem } = await $adminFetch<{ inventoryItem: AdminInventoryItem }>('/api/admin/inventory-items', {
          method: 'POST',
          body: { sku: reference },
        })
        await $adminFetch(`/api/admin/inventory-items/${inventoryItem.id}/variants`, {
          method: 'POST',
          body: { variantId: id, requiredQuantity: 1 },
        })
        await $adminFetch(`/api/admin/inventory-items/${inventoryItem.id}/location-levels/${draft.locationId}`, {
          method: 'POST',
          body: { stockedQuantity: quantity },
        })
      }
    }

    for (const channelId of draft.channelIds) {
      await $adminFetch(`/api/admin/sales-channels/${channelId}/products`, {
        method: 'POST',
        body: { add: [product.id] },
      })
    }

    await navigateTo(`/admin/produits/${product.id}`)
  } catch (err) {
    error.value = (err as { statusMessage?: string; message?: string }).statusMessage
      ?? (err as { message?: string }).message
      ?? t('errorGeneric')
    // The product exists but a later step failed — send the merchant to its
    // edit screen rather than making them retype everything.
    if (productId) await navigateTo(`/admin/produits/${productId}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PygPage :title="t('newProduct')" :description="t('newProductSubtitle')" back-to="/admin/produits">
    <template #actions>
      <UButton
        color="neutral"
        variant="outline"
        size="md"
        :icon="mode === 'steps' ? 'i-lucide-list' : 'i-lucide-footprints'"
        :label="mode === 'steps' ? t('wizardModeSwitchToForm') : t('wizardModeSwitchToSteps')"
        @click="mode = mode === 'steps' ? 'form' : 'steps'"
      />
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('errorTitle')"
      :description="error"
    />

    <UCard>
      <PygWizard
        v-if="mode === 'steps'"
        v-model="stepIndex"
        :steps="steps"
        :loading="saving"
        :finish-label="t('createAndPublish')"
        @finish="submit('published')"
      >
        <template v-for="step in steps" #[`step-${step.key}`] :key="step.key">
          <CatalogProductStep
            :step="step.key"
            :draft="draft"
            :currencies="currencies"
            :channels="channels"
            :locations="locations"
          />
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <div>
              <p class="text-sm text-muted">{{ t('summaryDescription') }}</p>
            </div>

            <div class="flex items-start gap-4">
              <img
                v-if="draft.photos[0]"
                :src="draft.photos[0].url"
                alt=""
                class="size-24 rounded-2xl object-cover bg-muted shrink-0"
              >
              <span v-else class="size-24 rounded-2xl bg-muted flex items-center justify-center text-dimmed shrink-0">
                <UIcon name="i-lucide-image-off" class="size-7" />
              </span>
              <div class="min-w-0">
                <p class="text-xl font-bold text-highlighted">{{ draft.title || '—' }}</p>
                <p v-if="draft.description" class="text-sm text-muted line-clamp-2">{{ draft.description }}</p>
                <PygStatus v-if="draft.isGiftcard" class="mt-1" :label="t('giftcard')" tone="info" icon="i-lucide-gift" />
              </div>
            </div>

            <!-- `first-letter:uppercase`: these labels mix section titles ("Les photos")
                 with inline vocabulary words ("déclinaisons", "stock"), which read as a
                 casing bug side by side. -->
            <dl class="grid grid-cols-2 sm:grid-cols-4 gap-4 [&_dt]:first-letter:uppercase">
              <div>
                <dt class="text-xs text-dimmed">{{ t('stepPhotos') }}</dt>
                <dd class="text-base font-semibold text-highlighted">{{ draft.photos.length }}</dd>
              </div>
              <div>
                <dt class="text-xs text-dimmed">{{ t('variants') }}</dt>
                <dd class="text-base font-semibold text-highlighted">{{ combos.length }}</dd>
              </div>
              <div>
                <dt class="text-xs text-dimmed">{{ t('inventory') }}</dt>
                <dd class="text-base font-semibold text-highlighted">{{ totalStock }}</dd>
              </div>
              <div>
                <dt class="text-xs text-dimmed">{{ t('stepChannels') }}</dt>
                <dd class="text-base font-semibold text-highlighted">{{ draft.channelIds.length }}</dd>
              </div>
            </dl>

            <ul v-if="currencies.length" class="flex flex-wrap gap-4">
              <li v-for="currency in currencies" :key="currency">
                <p class="text-xs text-dimmed">{{ t('priceLabel') }} · {{ currency.toUpperCase() }}</p>
                <PygMoney
                  :cents="parseAmountToMinor(priceInput(comboKey(combos[0] ?? []), currency), currency) ?? 0"
                  :currency="currency"
                  size="md"
                />
              </li>
            </ul>

            <div>
              <UButton
                color="neutral"
                variant="outline"
                size="md"
                icon="i-lucide-file-pen-line"
                :label="t('saveAsDraft')"
                :disabled="saving"
                @click="submit('draft')"
              />
            </div>
          </div>
        </template>
      </PygWizard>

      <!-- « Formulaire complet »: same bodies, all at once. -->
      <PygForm
        v-else
        :state="draft"
        :loading="saving"
        :submit-label="t('createAndPublish')"
        :cancel-label="t('saveAsDraft')"
        @submit="submit('published')"
        @cancel="submit('draft')"
      >
        <h2 class="text-lg font-bold text-highlighted">{{ t('fullFormTitle') }}</h2>
        <section v-for="step in steps" :key="step.key" class="flex flex-col gap-3 pt-4 border-t border-default first:border-t-0 first:pt-0">
          <div>
            <h3 class="font-bold text-highlighted">{{ step.title }}</h3>
            <p class="text-sm text-muted">{{ step.description }}</p>
          </div>
          <CatalogProductStep
            :step="step.key"
            :draft="draft"
            :currencies="currencies"
            :channels="channels"
            :locations="locations"
          />
        </section>
      </PygForm>
    </UCard>
  </PygPage>
</template>
