<script setup lang="ts">
/**
 * Fiche produit. Same six sections as the creation wizard, as tabs
 * (the guided flow creates, the tabs maintain).
 *
 * Photos, stock and boutiques read their real state from dedicated routes:
 *   - photos: `GET /admin/products/:id/images` — every photo is listed and
 *     removable, not just the ones added during this visit;
 *   - stock: `GET /admin/products/:id/variants/:vid/inventory-items` — the
 *     real variant->stock-item link, no more guessing by référence;
 *   - boutiques: `GET /admin/sales-channels/:id/products` — the ticked boxes
 *     are the actual state, and unticking one now removes.
 *
 * `prix` stays bounded: no admin read of a variant's default prices, so the
 * current price is read from the published storefront detail (which carries
 * `calculatedPrice.calculatedPriceId`) and a draft product can only have a
 * first price set.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const { $adminFetch } = useNuxtApp()
const route = useRoute()
const productId = computed(() => String(route.params.id))

const { data, status: fetchStatus, error, refresh } = useAdminFetch<{ product: AdminProduct }>(
  () => `/api/admin/products/${productId.value}`,
)
const product = computed(() => data.value?.product ?? null)
const loading = computed(() => fetchStatus.value === 'pending')

const { data: variantData, refresh: refreshVariants } = useAdminFetch<{ variants: AdminProductVariant[] }>(
  () => `/api/admin/products/${productId.value}/variants`,
)
const { data: optionData } = useAdminFetch<{ options: AdminProductOption[] }>(
  () => `/api/admin/products/${productId.value}/options`,
)
const variants = computed(() => variantData.value?.variants ?? [])
const options = computed(() => optionData.value?.options ?? [])

const { data: regionData } = useAdminFetch<{ regions: AdminRegion[] }>('/api/admin/regions', { query: { limit: 100 } })
const { data: channelData } = useAdminFetch<{ salesChannels: AdminSalesChannel[] }>('/api/admin/sales-channels', {
  query: { limit: 100 },
})
const currencies = computed(() => [...new Set((regionData.value?.regions ?? []).map((r) => r.currencyCode))])
const channels = computed(() => (channelData.value?.salesChannels ?? []).filter((c) => !c.isDisabled))

const tabs = computed(() => [
  { label: t('tabInfos'), value: 'infos', slot: 'infos' as const, icon: 'i-lucide-info' },
  { label: t('tabPhotos'), value: 'photos', slot: 'photos' as const, icon: 'i-lucide-image' },
  { label: t('tabVariants'), value: 'variants', slot: 'variants' as const, icon: 'i-lucide-shapes' },
  { label: t('tabPrices'), value: 'prices', slot: 'prices' as const, icon: 'i-lucide-coins' },
  { label: t('tabStock'), value: 'stock', slot: 'stock' as const, icon: 'i-lucide-boxes' },
  { label: t('tabChannels'), value: 'channels', slot: 'channels' as const, icon: 'i-lucide-store' },
])
const tab = ref('infos')

// --- infos ------------------------------------------------------------------
const infos = reactive({ title: '', description: '', isGiftcard: false, status: 'draft' as ProductStatus })
watch(product, (value) => {
  if (!value) return
  infos.title = value.title
  infos.description = value.description ?? ''
  infos.isGiftcard = value.isGiftcard
  infos.status = value.status
}, { immediate: true })

const savingInfos = ref(false)
const statusItems = computed(() => [
  { label: t('statusPublished'), value: 'published' },
  { label: t('statusDraft'), value: 'draft' },
  { label: t('statusProposed'), value: 'proposed' },
  { label: t('statusRejected'), value: 'rejected' },
])

async function saveInfos() {
  savingInfos.value = true
  try {
    await $adminFetch(`/api/admin/products/${productId.value}`, {
      method: 'POST',
      body: {
        title: infos.title.trim(),
        description: infos.description.trim() || null,
        isGiftcard: infos.isGiftcard,
        status: infos.status,
      },
    })
    await refresh()
  } finally {
    savingInfos.value = false
  }
}

// --- destructive: delete the product ----------------------------------------
const confirmDeleteProduct = ref(false)
const deleting = ref(false)

async function deleteProduct() {
  deleting.value = true
  try {
    await $adminFetch(`/api/admin/products/${productId.value}`, { method: 'DELETE' })
    await navigateTo('/admin/produits')
  } finally {
    deleting.value = false
  }
}

// --- photos -----------------------------------------------------------------
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const uploading = ref(false)
const { data: imageData, refresh: refreshImages } = useAdminFetch<{ images: AdminProductImage[] }>(
  () => `/api/admin/products/${productId.value}/images`,
)
const images = computed(() => imageData.value?.images ?? [])
const imageToDelete = ref<AdminProductImage | null>(null)

async function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploading.value = true
  try {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    const uploaded = await $adminFetch<{ files: { id: string; url: string }[] }>('/api/admin/uploads', {
      method: 'POST',
      body: form,
    })
    await $adminFetch(
      `/api/admin/products/${productId.value}/images`,
      { method: 'POST', body: { images: uploaded.files.map((file) => ({ url: file.url })) } },
    )
    await Promise.all([refreshImages(), refresh()])
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function deleteImage() {
  const image = imageToDelete.value
  if (!image) return
  await $adminFetch(`/api/admin/products/${productId.value}/images/${image.id}`, { method: 'DELETE' })
  imageToDelete.value = null
  await Promise.all([refreshImages(), refresh()])
}

// --- déclinaisons -----------------------------------------------------------
const references = reactive<Record<string, string>>({})
watch(variants, (list) => { for (const v of list) references[v.id] = v.sku ?? '' }, { immediate: true })
const variantToDelete = ref<AdminProductVariant | null>(null)
const newVariant = reactive<{ title: string; sku: string; values: Record<string, string> }>({ title: '', sku: '', values: {} })

async function saveReference(variant: AdminProductVariant) {
  await $adminFetch(`/api/admin/products/${productId.value}/variants/${variant.id}`, {
    method: 'POST',
    body: { sku: references[variant.id]?.trim() || null },
  })
  await refreshVariants()
}

async function deleteVariant() {
  const variant = variantToDelete.value
  if (!variant) return
  await $adminFetch(`/api/admin/products/${productId.value}/variants/${variant.id}`, { method: 'DELETE' })
  variantToDelete.value = null
  await refreshVariants()
}

async function addVariant() {
  const optionValueIds = options.value.map((option) => newVariant.values[option.id]).filter((id): id is string => Boolean(id))
  if (options.value.length && optionValueIds.length !== options.value.length) return
  await $adminFetch(`/api/admin/products/${productId.value}/variants`, {
    method: 'POST',
    body: {
      title: newVariant.title.trim() || t('variant'),
      sku: newVariant.sku.trim() || undefined,
      ...(optionValueIds.length ? { optionValueIds } : {}),
    },
  })
  newVariant.title = ''
  newVariant.sku = ''
  newVariant.values = {}
  await refreshVariants()
}

// --- prix -------------------------------------------------------------------
interface StorePrice { calculatedAmount: number | null; calculatedPriceId: string | null; priceListId: string | null }
/** `${variantId}|${currency}` -> the live default price row, when readable. */
const livePrices = ref<Record<string, StorePrice>>({})
const priceInputs = reactive<Record<string, string>>({})
const savingPrices = ref(false)

async function loadPrices() {
  livePrices.value = {}
  if (product.value?.status !== 'published') return
  for (const currency of currencies.value) {
    try {
      // Plain `$fetch`: this is a *store* route, so the admin interceptor's
      // 401-bounce / error toast (which is scoped to /api/admin/**) would be
      // the wrong behaviour here.
      const { product: storeProduct } = await $fetch<{
        product: { variants: { id: string; calculatedPrice: StorePrice | null }[] }
      }>(`/api/store/products/${productId.value}`, { query: { currency_code: currency } })
      for (const variant of storeProduct.variants) {
        if (!variant.calculatedPrice) continue
        const key = `${variant.id}|${currency}`
        livePrices.value[key] = variant.calculatedPrice
        if (variant.calculatedPrice.calculatedAmount !== null && !priceInputs[key]) {
          priceInputs[key] = minorToAmountInput(variant.calculatedPrice.calculatedAmount, currency)
        }
      }
    } catch {
      // Draft/unpublished or no price yet — the section explains it, no toast.
    }
  }
}
watch([product, currencies], loadPrices, { immediate: true })

async function savePrices() {
  savingPrices.value = true
  try {
    const create: { variantId: string; currencyCode: string; amount: number }[] = []
    const update: { id: string; amount: number }[] = []
    for (const variant of variants.value) {
      for (const currency of currencies.value) {
        const key = `${variant.id}|${currency}`
        const amount = parseAmountToMinor(priceInputs[key] ?? '', currency)
        if (amount === null) continue
        const live = livePrices.value[key]
        // Only a *default* price row (no price list) may be updated in place —
        // a sale price belongs to its price list, not to this screen.
        if (live?.calculatedPriceId && !live.priceListId) update.push({ id: live.calculatedPriceId, amount })
        else if (!live?.calculatedPriceId) create.push({ variantId: variant.id, currencyCode: currency, amount })
      }
    }
    if (create.length || update.length) {
      await $adminFetch('/api/admin/prices/batch', { method: 'POST', body: { create, update } })
    }
    await loadPrices()
  } finally {
    savingPrices.value = false
  }
}

// --- stock ------------------------------------------------------------------
/** Variant id -> its stock levels, via the real variant<->stock-item link (B5). */
const stockByVariant = ref<Record<string, AdminLocationLevel[]>>({})

async function loadStock() {
  const entries = await Promise.all(variants.value.map(async (variant) => {
    const { inventoryItems } = await $adminFetch<{ inventoryItems: { inventoryItemId: string }[] }>(
      `/api/admin/products/${productId.value}/variants/${variant.id}/inventory-items`,
    )
    const levels = await Promise.all(inventoryItems.map(async (link) => {
      const { locationLevels } = await $adminFetch<{ locationLevels: AdminLocationLevel[] }>(
        `/api/admin/inventory-items/${link.inventoryItemId}/location-levels`,
      )
      return locationLevels
    }))
    return [variant.id, levels.flat()] as const
  }))
  stockByVariant.value = Object.fromEntries(entries)
}
watch(variants, loadStock, { immediate: true })

function availableFor(variant: AdminProductVariant): number | null {
  const levels = stockByVariant.value[variant.id]
  if (!levels?.length) return null
  return levels.reduce((sum, level) => sum + level.available, 0)
}

// --- boutiques ---------------------------------------------------------------
// `GET /admin/sales-channels/:id/products` (B3) is what makes this a real
// two-way control: the boxes show where the product IS sold, and unticking one
// removes it. Before the route existed the tab could only ever add.
const channelIds = ref<string[]>([])
const savedChannelIds = ref<string[]>([])
const savingChannels = ref(false)

async function loadChannelMembership() {
  const memberOf = await Promise.all(channels.value.map(async (channel) => {
    const { productIds } = await $adminFetch<{ productIds: string[] }>(
      `/api/admin/sales-channels/${channel.id}/products`,
    )
    return productIds.includes(productId.value) ? channel.id : null
  }))
  savedChannelIds.value = memberOf.filter((id): id is string => Boolean(id))
  channelIds.value = [...savedChannelIds.value]
}
watch(channels, loadChannelMembership, { immediate: true })

const channelsDirty = computed(() =>
  channelIds.value.length !== savedChannelIds.value.length
  || channelIds.value.some((id) => !savedChannelIds.value.includes(id)),
)

async function saveChannels() {
  savingChannels.value = true
  try {
    await Promise.all(channels.value.map((channel) => {
      const wanted = channelIds.value.includes(channel.id)
      const had = savedChannelIds.value.includes(channel.id)
      if (wanted === had) return Promise.resolve()
      return $adminFetch(`/api/admin/sales-channels/${channel.id}/products`, {
        method: 'POST',
        body: wanted ? { add: [productId.value] } : { remove: [productId.value] },
      })
    }))
    await loadChannelMembership()
  } finally {
    savingChannels.value = false
  }
}
</script>

<template>
  <!-- On error the title stayed on « Chargement… » forever and « Supprimer »
       was still offered for a product that does not exist. -->
  <PygPage :title="product?.title ?? (error ? t('errorTitle') : t('loading'))" back-to="/admin/produits">
    <template v-if="product" #actions>
      <PygStatus
        :label="t(productStatusDisplay(product.status).key)"
        :tone="productStatusDisplay(product.status).tone"
        :icon="productStatusDisplay(product.status).icon"
      />
      <UButton
        color="error"
        variant="outline"
        size="md"
        icon="i-lucide-trash-2"
        :label="t('delete')"
        @click="confirmDeleteProduct = true"
      />
    </template>

    <div v-if="loading" class="flex flex-col gap-3" role="status" aria-live="polite">
      <USkeleton v-for="n in 3" :key="n" class="h-16 w-full rounded-2xl" />
    </div>

    <PygEmptyState
      v-else-if="error || !product"
      icon="i-lucide-package-x"
      :title="t('errorTitle')"
      :description="t('productNotFound')"
      :action-label="t('sectionProducts')"
      action-to="/admin/produits"
    />

    <UTabs v-else v-model="tab" :items="tabs">
      <!-- Le produit -->
      <template #infos>
        <UCard>
          <PygForm
            :state="infos"
            :loading="savingInfos"
            :show-cancel="false"
            :submit-label="t('save')"
            @submit="saveInfos"
          >
            <UFormField :label="t('productName')" name="title" required>
              <UInput v-model="infos.title" size="md" class="w-full" />
            </UFormField>
            <UFormField :label="t('productDescription')" name="description" :hint="t('optional')">
              <UTextarea v-model="infos.description" :rows="4" class="w-full" />
            </UFormField>
            <UFormField :label="t('productStatus')" name="status" class="sm:w-64">
              <USelect v-model="infos.status" :items="statusItems" value-key="value" size="md" class="w-full" />
            </UFormField>
            <USwitch v-model="infos.isGiftcard" :label="t('giftcard')" :description="t('giftcardHint')" />
          </PygForm>
        </UCard>
      </template>

      <!-- Photos -->
      <template #photos>
        <UCard>
          <div class="flex flex-col gap-4">
            <ul class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <li v-for="image in images" :key="image.id" class="relative">
                <img :src="image.url" alt="" class="aspect-square w-full rounded-xl object-cover bg-muted">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  square
                  size="sm"
                  class="absolute top-1 end-1"
                  :aria-label="t('remove')"
                  @click="imageToDelete = image"
                />
              </li>
            </ul>
            <p v-if="!images.length" class="text-sm text-muted">{{ t('noPhotosYet') }}</p>

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
        </UCard>
      </template>

      <!-- Déclinaisons -->
      <template #variants>
        <UCard>
          <div class="flex flex-col gap-4">
            <!-- Editable rows, not a data table: each line is a form field
                 (référence) plus its destructive action, so `PygList` (read
                 rows + row link) is the wrong socle component here. -->
            <ul v-if="variants.length" class="flex flex-col gap-2">
              <li
                v-for="variant in variants"
                :key="variant.id"
                class="flex flex-col sm:flex-row sm:items-end gap-2 rounded-xl border border-default p-3"
              >
                <span class="flex-1 text-sm font-semibold text-highlighted">{{ variant.title }}</span>
                <UFormField :label="t('sku')" :name="`ref-${variant.id}`" :hint="t('optional')" class="sm:w-56">
                  <UInput v-model="references[variant.id]" size="md" class="w-full" @blur="saveReference(variant)" />
                </UFormField>
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  square
                  size="md"
                  :aria-label="t('delete')"
                  @click="variantToDelete = variant"
                />
              </li>
            </ul>
            <PygEmptyState
              v-else
              icon="i-lucide-shapes"
              :title="t('emptyGenericTitle')"
              :description="t('generatedVariants')"
            />

            <div class="flex flex-col sm:flex-row sm:items-end gap-2 pt-4 border-t border-default">
              <UFormField
                v-for="option in options"
                :key="option.id"
                :label="option.title"
                :name="`new-${option.id}`"
                class="sm:w-40"
              >
                <USelect
                  v-model="newVariant.values[option.id]"
                  :items="option.values.map((v) => ({ label: v.value, value: v.id }))"
                  value-key="value"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="t('productName')" name="new-title" class="flex-1">
                <UInput v-model="newVariant.title" size="md" class="w-full" />
              </UFormField>
              <UFormField :label="t('sku')" name="new-sku" :hint="t('optional')" class="sm:w-48">
                <UInput v-model="newVariant.sku" size="md" class="w-full" />
              </UFormField>
              <UButton icon="i-lucide-plus" size="md" :label="t('add')" @click="addVariant" />
            </div>
          </div>
        </UCard>
      </template>

      <!-- Prix -->
      <template #prices>
        <UCard>
          <div class="flex flex-col gap-4">
            <PygEmptyState
              v-if="!currencies.length"
              icon="i-lucide-coins"
              :title="t('noCurrencyTitle')"
              :description="t('noCurrencyDescription')"
            />
            <template v-else>
              <UAlert
                v-if="product.status !== 'published'"
                color="info"
                variant="soft"
                icon="i-lucide-info"
                :title="t('pricesNeedPublishTitle')"
                :description="t('pricesNeedPublishDescription')"
              />

              <ul class="flex flex-col gap-3">
                <li v-for="variant in variants" :key="variant.id" class="rounded-xl border border-default p-3 flex flex-col gap-3">
                  <div class="flex items-baseline justify-between gap-3">
                    <span class="text-sm font-semibold text-highlighted">{{ variant.title }}</span>
                    <PygMoney
                      v-if="livePrices[`${variant.id}|${currencies[0]}`]?.calculatedAmount != null"
                      :cents="livePrices[`${variant.id}|${currencies[0]}`]!.calculatedAmount!"
                      :currency="currencies[0]"
                      size="md"
                    />
                  </div>
                  <div class="flex flex-col sm:flex-row gap-3">
                    <UFormField
                      v-for="currency in currencies"
                      :key="currency"
                      :label="`${t('priceLabel')} (${currency.toUpperCase()})`"
                      :name="`price-${variant.id}-${currency}`"
                      class="sm:w-56"
                    >
                      <UInput
                        v-model="priceInputs[`${variant.id}|${currency}`]"
                        size="md"
                        class="w-full"
                        inputmode="decimal"
                        placeholder="0"
                      />
                    </UFormField>
                  </div>
                </li>
              </ul>

              <div>
                <UButton size="md" :label="t('save')" :loading="savingPrices" @click="savePrices" />
              </div>
            </template>
          </div>
        </UCard>
      </template>

      <!-- Stock -->
      <template #stock>
        <UCard>
          <div class="flex flex-col gap-4">
            <PygEmptyState
              v-if="!variants.some((v) => v.sku)"
              icon="i-lucide-boxes"
              :title="t('stockNeedsReferenceTitle')"
              :description="t('stockNeedsReferenceDescription')"
            />
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="variant in variants"
                :key="variant.id"
                class="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-default p-3"
              >
                <span class="flex-1 text-sm font-semibold text-highlighted">{{ variant.title }}</span>
                <span class="text-sm text-muted">{{ t('sku') }} : {{ variant.sku ?? '—' }}</span>
                <span class="text-base font-bold text-highlighted">
                  {{ availableFor(variant) ?? '—' }} <span class="text-xs font-normal text-muted">{{ t('stockAvailable') }}</span>
                </span>
                <UButton
                  v-if="variant.sku"
                  color="neutral"
                  variant="outline"
                  size="md"
                  icon="i-lucide-sliders-horizontal"
                  :label="t('stockAdjust')"
                  :to="`/admin/produits/stock?q=${encodeURIComponent(variant.sku)}`"
                />
              </li>
            </ul>
          </div>
        </UCard>
      </template>

      <!-- Boutiques -->
      <template #channels>
        <UCard>
          <div class="flex flex-col gap-4">
            <PygEmptyState
              v-if="!channels.length"
              icon="i-lucide-store"
              :title="t('noChannelTitle')"
              :description="t('noChannelDescription')"
            />
            <template v-else>
              <UCheckbox
                v-for="channel in channels"
                :key="channel.id"
                :model-value="channelIds.includes(channel.id)"
                :label="channel.name"
                @update:model-value="(checked) => {
                  if (checked) channelIds.push(channel.id)
                  else channelIds.splice(channelIds.indexOf(channel.id), 1)
                }"
              />
              <div>
                <UButton
                  size="md"
                  :label="t('save')"
                  :loading="savingChannels"
                  :disabled="!channelsDirty"
                  @click="saveChannels"
                />
              </div>
            </template>
          </div>
        </UCard>
      </template>
    </UTabs>

    <PygConfirm
      :open="confirmDeleteProduct"
      :title="t('deleteProductTitle')"
      :description="t('deleteProductBody')"
      :confirm-label="t('delete')"
      :loading="deleting"
      @update:open="(value) => { confirmDeleteProduct = value }"
      @confirm="deleteProduct"
    />

    <PygConfirm
      :open="Boolean(imageToDelete)"
      :title="t('deletePhotoTitle')"
      :description="t('deletePhotoBody')"
      :confirm-label="t('delete')"
      @update:open="(value) => { if (!value) imageToDelete = null }"
      @confirm="deleteImage"
    />

    <PygConfirm
      :open="Boolean(variantToDelete)"
      :title="t('deleteVariantTitle')"
      :description="t('deleteVariantBody')"
      :confirm-label="t('delete')"
      @update:open="(value) => { if (!value) variantToDelete = null }"
      @confirm="deleteVariant"
    />
  </PygPage>
</template>
