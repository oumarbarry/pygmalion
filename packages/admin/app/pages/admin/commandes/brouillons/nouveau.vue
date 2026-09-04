<script setup lang="ts">
/**
 * The draft-order wizard, an order built by hand: customer →
 * selling area → items (catalogue or free) → address → delivery → summary.
 *
 * Catalogue lines send only `variantId` + quantity: the server prices them
 * through the pricing engine, so a merchant never types a catalogue price.
 * Free lines carry their own title + price.
 */
definePageMeta({ layout: 'admin' })

const { t } = useVocabulary()
const fetcher = useAdminApi()

interface Region { id: string; name: string; currencyCode: string }
interface Customer { id: string; email: string | null; firstName: string | null; lastName: string | null }
interface Product { id: string; title: string; thumbnail: string | null }
interface Variant { id: string; title: string; sku: string | null }
interface DraftLine { key: number; variantId: string | null; title: string; priceMajor: number; quantity: number }

const { data: regionsData } = useAdminFetch<{ regions: Region[] }>('/api/admin/regions')
const { data: customersData } = useAdminFetch<{ customers: Customer[] }>('/api/admin/customers', { query: { limit: 20 } })
const regions = computed(() => regionsData.value?.regions ?? [])
const customers = computed(() => customersData.value?.customers ?? [])

const stepIndex = ref(0)
const email = ref('')
const customerId = ref<string | null>(null)
const regionId = ref<string | null>(null)
const lines = ref<DraftLine[]>([])
const address = ref({ firstName: '', lastName: '', address1: '', city: '', postalCode: '', countryCode: '', phone: '' })
const shippingName = ref('')
const shippingMajor = ref(0)
let nextKey = 1

watch(regions, (list) => { if (!regionId.value && list.length) regionId.value = list[0]!.id }, { immediate: true })
const region = computed(() => regions.value.find((r) => r.id === regionId.value) ?? null)
const currency = computed(() => region.value?.currencyCode ?? 'EUR')

// --- Catalogue picker ---------------------------------------------------------

const search = ref('')
const products = ref<Product[]>([])
const openProduct = ref<Product | null>(null)
const variants = ref<Variant[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(search, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim()) {
    products.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetcher<{ products: Product[] }>('/api/admin/products', { query: { q, limit: 5 } })
      products.value = res.products
    } catch {
      products.value = []
    }
  }, 250)
})

async function pickProduct(product: Product) {
  openProduct.value = product
  variants.value = []
  try {
    const res = await fetcher<{ variants: Variant[] }>(`/api/admin/products/${product.id}/variants`)
    variants.value = res.variants
  } catch {
    variants.value = []
  }
}

function addVariant(variant: Variant) {
  lines.value.push({ key: nextKey++, variantId: variant.id, title: `${openProduct.value?.title ?? ''} — ${variant.title}`, priceMajor: 0, quantity: 1 })
  openProduct.value = null
  variants.value = []
  search.value = ''
  products.value = []
}

// --- Payload ------------------------------------------------------------------

const items = computed(() =>
  lines.value
    .filter((l) => l.variantId || l.title.trim())
    .map((l) =>
      l.variantId
        ? { variantId: l.variantId, quantity: Math.max(1, Math.round(Number(l.quantity))) }
        : { title: l.title.trim(), unitPrice: Math.max(0, Math.round(Number(l.priceMajor || 0) * 100)), quantity: Math.max(1, Math.round(Number(l.quantity))) },
    ),
)

const shippingAddress = computed(() => {
  const entries = Object.entries(address.value).filter(([, value]) => value.trim())
  return entries.length ? Object.fromEntries(entries) : null
})

const valid = computed(() => !!regionId.value && items.value.length > 0 && (!!email.value.trim() || !!customerId.value))

const steps = computed(() => [
  { key: 'customer', title: t('wizCustomerTitle'), description: t('wizCustomerDescription') },
  { key: 'region', title: t('wizRegionTitle'), description: t('wizRegionDescription') },
  { key: 'lines', title: t('wizDraftLinesTitle'), description: t('wizDraftLinesDescription') },
  { key: 'address', title: t('wizAddressTitle'), description: t('wizAddressDescription') },
  { key: 'shipping', title: t('wizShippingTitle'), description: t('wizShippingDescription') },
])

const busy = ref(false)
const toast = useToast()

async function finish() {
  if (!valid.value || busy.value) return
  busy.value = true
  try {
    const { draftOrder } = await fetcher<{ draftOrder: { id: string } }>('/api/admin/draft-orders', {
      method: 'POST',
      body: {
        regionId: regionId.value,
        currencyCode: currency.value,
        email: email.value.trim() || null,
        customerId: customerId.value,
        items: items.value,
        shippingMethod: shippingName.value.trim()
          ? { name: shippingName.value.trim(), amount: Math.max(0, Math.round(Number(shippingMajor.value || 0) * 100)) }
          : null,
        shippingAddress: shippingAddress.value,
      },
    })
    toast.add({ title: t('draftCreated'), color: 'success', icon: 'i-lucide-file-pen-line' })
    await navigateTo(`/admin/commandes/brouillons/${draftOrder.id}`)
  } catch {
    // $adminFetch already surfaced the reason.
  } finally {
    busy.value = false
  }
}

const customerLabel = (c: Customer) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.id

function pickCustomer(customer: Customer) {
  const selected = customerId.value === customer.id
  customerId.value = selected ? null : customer.id
  if (!selected && customer.email) email.value = customer.email
}
</script>

<template>
  <PygPage :title="t('draftWizardTitle')" back-to="/admin/commandes/brouillons">
    <UCard>
      <PygWizard v-model="stepIndex" :steps="steps" :loading="busy" :finish-label="t('create')" @finish="finish">
        <template #step-customer>
          <div class="flex flex-col gap-4">
            <UFormField :label="t('email')">
              <UInput v-model="email" type="email" size="lg" icon="i-lucide-mail" />
            </UFormField>
            <div v-if="customers.length" class="flex flex-wrap gap-2">
              <UButton
                v-for="customer in customers"
                :key="customer.id"
                size="sm"
                class="pyg-tap-target"
                :color="customerId === customer.id ? 'primary' : 'neutral'"
                :variant="customerId === customer.id ? 'soft' : 'outline'"
                :label="customerLabel(customer)"
                @click="pickCustomer(customer)"
              />
            </div>
          </div>
        </template>

        <template #step-region>
          <div v-if="regions.length" class="flex flex-wrap gap-2">
            <UButton
              v-for="item in regions"
              :key="item.id"
              class="pyg-tap-target"
              :color="regionId === item.id ? 'primary' : 'neutral'"
              :variant="regionId === item.id ? 'soft' : 'outline'"
              :label="`${item.name} · ${item.currencyCode.toUpperCase()}`"
              icon="i-lucide-globe"
              @click="regionId = item.id"
            />
          </div>
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-info" :description="t('wizNoRegions')" />
        </template>

        <template #step-lines>
          <div class="flex flex-col gap-4">
            <UFormField :label="t('catalogPick')">
              <UInput v-model="search" size="lg" icon="i-lucide-search" :placeholder="t('catalogSearchPlaceholder')" />
            </UFormField>

            <ul v-if="products.length && !openProduct" class="flex flex-col gap-2">
              <li v-for="product in products" :key="product.id">
                <UButton block color="neutral" variant="outline" class="justify-start pyg-tap-target" :label="product.title" @click="pickProduct(product)" />
              </li>
            </ul>

            <div v-if="openProduct" class="flex flex-col gap-2">
              <p class="text-sm font-semibold text-highlighted">{{ openProduct.title }}</p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="variant in variants"
                  :key="variant.id"
                  size="sm"
                  color="primary"
                  variant="soft"
                  class="pyg-tap-target"
                  icon="i-lucide-plus"
                  :label="variant.title"
                  @click="addVariant(variant)"
                />
              </div>
              <UButton size="sm" color="neutral" variant="ghost" :label="t('cancel')" @click="openProduct = null" />
            </div>

            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              class="pyg-tap-target self-start"
              :label="t('customLineAdd')"
              @click="lines.push({ key: nextKey++, variantId: null, title: '', priceMajor: 0, quantity: 1 })"
            />

            <p v-if="!lines.length" class="text-sm text-muted">{{ t('noItems') }}</p>
            <div v-for="line in lines" :key="line.key" class="flex flex-wrap items-end gap-3 rounded-xl border border-default p-3">
              <UFormField :label="t('labelTitle')" class="min-w-40 flex-1">
                <UInput v-model="line.title" size="lg" :disabled="!!line.variantId" />
              </UFormField>
              <UFormField v-if="!line.variantId" :label="t('labelPrice')" class="w-28">
                <UInput v-model.number="line.priceMajor" type="number" min="0" step="0.01" size="lg" />
              </UFormField>
              <UFormField :label="t('labelQuantity')" class="w-24">
                <UInput v-model.number="line.quantity" type="number" min="1" size="lg" />
              </UFormField>
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                class="pyg-tap-target"
                :aria-label="t('removeLine')"
                @click="lines = lines.filter((l) => l.key !== line.key)"
              />
            </div>
          </div>
        </template>

        <template #step-address>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField :label="t('addressFirstName')"><UInput v-model="address.firstName" size="lg" /></UFormField>
            <UFormField :label="t('addressLastName')"><UInput v-model="address.lastName" size="lg" /></UFormField>
            <UFormField :label="t('addressLine1')" class="sm:col-span-2"><UInput v-model="address.address1" size="lg" /></UFormField>
            <UFormField :label="t('addressPostalCode')"><UInput v-model="address.postalCode" size="lg" /></UFormField>
            <UFormField :label="t('addressCity')"><UInput v-model="address.city" size="lg" /></UFormField>
            <UFormField :label="t('addressCountry')"><UInput v-model="address.countryCode" size="lg" /></UFormField>
            <UFormField :label="t('addressPhone')"><UInput v-model="address.phone" size="lg" /></UFormField>
          </div>
        </template>

        <template #step-shipping>
          <div class="flex flex-col gap-4">
            <UFormField :label="t('shippingMethodName')" :hint="t('labelOptional')">
              <UInput v-model="shippingName" size="lg" icon="i-lucide-truck" />
            </UFormField>
            <UFormField v-if="shippingName.trim()" :label="t('shippingMethodAmount')">
              <UInput v-model.number="shippingMajor" type="number" min="0" step="0.01" size="lg" />
            </UFormField>
            <p v-else class="text-sm text-muted">{{ t('noShippingMethod') }}</p>
          </div>
        </template>

        <template #summary>
          <div class="flex flex-col gap-4">
            <UAlert v-if="!valid" color="warning" variant="soft" icon="i-lucide-triangle-alert" :title="t('pickAtLeastOne')" />
            <template v-else>
              <p class="text-sm text-muted">{{ email || customers.find((c) => c.id === customerId)?.email }}</p>
              <p class="text-sm text-muted">{{ region?.name }}</p>
              <ul class="text-sm">
                <li v-for="line in lines" :key="line.key">{{ line.quantity }} × {{ line.title || t('customLineAdd') }}</li>
              </ul>
              <p v-if="shippingName.trim()" class="text-sm text-muted">
                {{ shippingName }} · <PygMoney :cents="Math.round(Number(shippingMajor || 0) * 100)" :currency="currency" size="sm" />
              </p>
            </template>
          </div>
        </template>
      </PygWizard>
    </UCard>
  </PygPage>
</template>
