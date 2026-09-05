/**
 * "Aujourd'hui" dashboard data.
 *
 * ponytail: `toShip`/`toRefund` still return empty lists on purpose: no mock
 * data, no backend call. Upgrade path once the orders screens wire them up:
 * replace the two `ref([])` below with `useAdminFetch('/api/admin/orders',
 * { query: { status: ... } })` calls (expected shape: `{ orders: [...] }`),
 * keeping the same return contract so the dashboard page doesn't change.
 *
 * The two catalogue tiles below ARE wired: they answer "what is stopping
 * me from selling today" using the product/inventory routes that exist.
 */
export interface TodayOrderSummary {
  id: string
  displayId: string
  customerName: string
  totalCents: number
  currency: string
  createdAt: string
}

export interface TodayLowStockItem {
  id: string
  reference: string
  available: number
}

export interface TodayProductGap {
  id: string
  title: string
}

/** Dashboard tiles scan the first page only — a merchant fixes the top of the list, not row 900. */
const DASHBOARD_SCAN_LIMIT = 20

export function useTodayOverview() {
  const toShip = ref<TodayOrderSummary[]>([])
  const toRefund = ref<TodayOrderSummary[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const { $adminFetch } = useNuxtApp()

  // Bientôt en rupture. There is no bulk levels endpoint, so this is one call
  // per item over the first page (see DASHBOARD_SCAN_LIMIT).
  const { data: lowStockData, status: lowStockStatus } = useAsyncData(
    'today-low-stock',
    async () => {
      const { inventoryItems } = await $adminFetch<{ inventoryItems: AdminInventoryItem[] }>(
        '/api/admin/inventory-items',
        { query: { limit: DASHBOARD_SCAN_LIMIT } },
      )
      const rows = await Promise.all(inventoryItems.map(async (item) => {
        const { locationLevels } = await $adminFetch<{ locationLevels: AdminLocationLevel[] }>(
          `/api/admin/inventory-items/${item.id}/location-levels`,
        )
        return {
          id: item.id,
          reference: item.sku ?? item.id,
          available: locationLevels.reduce((sum, level) => sum + level.available, 0),
          counted: locationLevels.length > 0,
        }
      }))
      return rows
        .filter((row) => row.counted && row.available <= LOW_STOCK_THRESHOLD)
        .map(({ id, reference, available }) => ({ id, reference, available }))
    },
    { default: () => [] as TodayLowStockItem[] },
  )

  // Produits sans photo — the cheapest, highest-impact gap a merchant can fix.
  // "Sans prix" is deliberately absent: no admin route reads a variant's
  // default prices, and inferring it
  // from the storefront would silently skip every draft product.
  const { data: noPhotoData, status: noPhotoStatus } = useAsyncData(
    'today-no-photo',
    async () => {
      const { products } = await $adminFetch<{ products: AdminProduct[] }>('/api/admin/products', {
        query: { limit: DASHBOARD_SCAN_LIMIT },
      })
      return products.filter((product) => !product.thumbnail).map(({ id, title }) => ({ id, title }))
    },
    { default: () => [] as TodayProductGap[] },
  )

  const lowStock = computed(() => lowStockData.value ?? [])
  const productsWithoutPhoto = computed(() => noPhotoData.value ?? [])
  const catalogLoading = computed(() => lowStockStatus.value === 'pending' || noPhotoStatus.value === 'pending')

  return { toShip, toRefund, loading, error, lowStock, productsWithoutPhoto, catalogLoading }
}
