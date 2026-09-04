import type { PygStatusTone } from '../components/PygStatus.vue'
import type { PygSubNavItem } from '../components/PygSubNav.vue'
import type { VocabKey } from '../utils/vocabulary'

/**
 * Shared shapes + helpers for the Produits section. Types mirror what
 * `/api/admin/**` actually returns (packages/core services) — kept here rather
 * than imported from @oumarbarry/pygmalion-core so the admin layer stays a pure UI
 * package with no server-side dependency.
 */

export type ProductStatus = 'draft' | 'proposed' | 'published' | 'rejected'

export interface AdminProduct {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  handle: string
  status: ProductStatus
  thumbnail: string | null
  isGiftcard: boolean
  discountable: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminProductOption {
  id: string
  title: string
  values: { id: string; value: string; rank: number }[]
}

export interface AdminProductVariant {
  id: string
  title: string
  sku: string | null
  variantRank: number
  manageInventory: boolean
  optionValueIds: string[]
}

export interface AdminProductImage {
  id: string
  url: string
  rank: number
}

export interface AdminCollection {
  id: string
  title: string
  handle: string
}

export interface AdminCategory {
  id: string
  name: string
  handle: string
  description: string | null
  parentCategoryId: string | null
  mpath: string
  isActive: boolean
  isInternal: boolean
  rank: number
}

export interface AdminTag {
  id: string
  value: string
}

export interface AdminRegion {
  id: string
  name: string
  currencyCode: string
}

export interface AdminSalesChannel {
  id: string
  name: string
  isDisabled: boolean
}

export interface AdminStockLocation {
  id: string
  name: string
}

export interface AdminInventoryItem {
  id: string
  sku: string | null
  requiresShipping: boolean
}

/**
 * `GET /api/admin/inventory-items/:id/location-levels` returns the stored row
 * spread with the *computed* availability (`stocked`/`reserved`/`available` —
 * reserved and available are never persisted). The short names
 * are the API's, not a rename.
 */
export interface AdminLocationLevel {
  id: string
  locationId: string
  stocked: number
  reserved: number
  available: number
}

export interface AdminReservation {
  id: string
  inventoryItemId: string
  locationId: string
  quantity: number
  lineItemId: string | null
  description: string | null
  createdAt: string
}

export interface AdminPricePreference {
  id: string
  attribute: 'region_id' | 'currency_code'
  value: string | null
  isTaxInclusive: boolean
}

/**
 * What the product wizard collects before anything is written. One flat
 * object so the same step bodies render inside `PygWizard` (guided, default)
 * and stacked in the « formulaire complet » mode.
 *
 * Per-déclinaison maps are keyed by the joined option values ('S / bleu', or
 * '' for a product with a single déclinaison) rather than by index, so
 * editing an option earlier in the wizard doesn't shuffle what the merchant
 * already typed.
 */
export interface ProductDraft {
  title: string
  description: string
  isGiftcard: boolean
  photos: { id: string; url: string }[]
  hasVariants: boolean
  options: { title: string; valuesInput: string }[]
  references: Record<string, string>
  samePriceForAll: boolean
  prices: Record<string, string>
  variantPrices: Record<string, string>
  locationId: string
  stock: Record<string, string>
  channelIds: string[]
}

export function emptyProductDraft(): ProductDraft {
  return {
    title: '',
    description: '',
    isGiftcard: false,
    photos: [],
    hasVariants: false,
    options: [{ title: '', valuesInput: '' }],
    references: {},
    samePriceForAll: true,
    prices: {},
    variantPrices: {},
    locationId: '',
    stock: {},
    channelIds: [],
  }
}

/** Below this many sellable units an item is flagged "running low" (one number, no config screen). */
export const LOW_STOCK_THRESHOLD = 5

/** Second-level nav of the « Produits » section: the 6-item sidebar never grows. */
export function useCatalogNav(): ComputedRef<PygSubNavItem[]> {
  const { t } = useVocabulary()
  return computed(() => [
    { label: t('navProducts'), to: '/admin/produits', icon: 'i-lucide-shopping-bag', exact: true },
    { label: t('navCollections'), to: '/admin/produits/collections', icon: 'i-lucide-layers' },
    { label: t('navCategories'), to: '/admin/produits/categories', icon: 'i-lucide-folder-tree' },
    { label: t('navTags'), to: '/admin/produits/etiquettes', icon: 'i-lucide-tags' },
    { label: t('navStock'), to: '/admin/produits/stock', icon: 'i-lucide-boxes' },
    { label: t('navPricing'), to: '/admin/produits/prix-taxes', icon: 'i-lucide-receipt' },
  ])
}

/** Status -> PygStatus tone + label key (icon + color + label, never color alone). */
export function productStatusDisplay(status: ProductStatus): { tone: PygStatusTone; key: VocabKey; icon: string } {
  switch (status) {
    case 'published':
      return { tone: 'success', key: 'statusPublished', icon: 'i-lucide-circle-check' }
    case 'proposed':
      return { tone: 'info', key: 'statusProposed', icon: 'i-lucide-clock' }
    case 'rejected':
      return { tone: 'error', key: 'statusRejected', icon: 'i-lucide-circle-x' }
    default:
      return { tone: 'neutral', key: 'statusDraft', icon: 'i-lucide-pencil' }
  }
}
