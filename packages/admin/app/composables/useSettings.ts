import type { PygStatusTone } from '../components/PygStatus.vue'
import type { PygSubNavItem } from '../components/PygSubNav.vue'
import type { VocabKey } from '../utils/vocabulary'

/**
 * Shared shapes + helpers for the Réglages section. Same rule as
 * `useCatalog.ts`: types mirror what `/api/admin/**` really returns, declared
 * here so the admin layer keeps zero server-side dependency.
 */

// --- Boutique ------------------------------------------------------------------

export interface AdminStore {
  id: string
  name: string
  defaultRegionId: string | null
  defaultSalesChannelId: string | null
  defaultLocationId: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminCurrency {
  code: string
  symbol: string
  symbolNative: string
  name: string
  decimalDigits: number
}

// --- Zones de vente (regions) ---------------------------------------------------

/** `AdminRegion` (useCatalog) + the fields only the settings screens edit. */
export interface AdminRegionDetail {
  id: string
  name: string
  currencyCode: string
  automaticTaxes: boolean
  createdAt: string
}

/**
 * Mirrors `COUNTRY_SEED` (packages/core/src/services/regions.ts):
 * no route exposes `region_country`, so the picker can't be fetched. Delete
 * this constant the day a `GET /admin/countries` exists.
 */
export const COUNTRY_CODES: readonly string[] = [
  'DE', 'AU', 'BE', 'BR', 'CA', 'CN', 'DK', 'ES', 'US', 'FR', 'IE', 'IT', 'JP', 'IN', 'MX',
  'NO', 'NZ', 'NL', 'PL', 'PT', 'GB', 'SG', 'ZA', 'SE', 'CH',
]

/** Country name in the admin's language; the code itself when it is not a valid region code. */
export function countryName(iso2: string, locale = 'en-US'): string {
  const code = iso2.toUpperCase()
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** The picker rows, named and sorted for one language. */
export function countryList(locale = 'en-US'): { iso2: string; name: string }[] {
  return COUNTRY_CODES.map((iso2) => ({ iso2, name: countryName(iso2, locale) })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  )
}

// --- Taxes ----------------------------------------------------------------------

export interface AdminTaxRegion {
  id: string
  countryCode: string
  provinceCode: string | null
  providerId: string | null
  parentId: string | null
  createdAt: string
}

export interface AdminTaxRateRule {
  id: string
  reference: string
  referenceId: string
}

export interface AdminTaxRate {
  id: string
  taxRegionId: string
  code: string
  name: string
  rate: number | null
  isDefault: boolean
  isCombinable: boolean
  rules?: AdminTaxRateRule[]
}

// --- Livraison ------------------------------------------------------------------

export interface AdminFulfillmentSet {
  id: string
  name: string
  createdAt: string
}

export interface AdminGeoZone {
  id: string
  type: 'country' | 'province' | 'city' | 'zip'
  countryCode: string
  provinceCode: string | null
  city: string | null
}

export interface AdminServiceZone {
  id: string
  fulfillmentSetId: string
  name: string
  createdAt: string
}

export interface AdminShippingProfile {
  id: string
  name: string
  isDefault: boolean
  createdAt: string
}

export interface AdminShippingOption {
  id: string
  name: string
  serviceZoneId: string
  shippingProfileId: string
  providerId: string
  priceType: 'flat' | 'calculated'
  createdAt: string
}

export interface AdminProvider {
  id: string
  type: string
}

// --- Canaux de vente ------------------------------------------------------------

export interface AdminSalesChannelDetail {
  id: string
  name: string
  description: string | null
  isDisabled: boolean
  createdAt: string
}

// --- Clés boutique --------------------------------------------------------------

export interface AdminApiKey {
  id: string
  name: string | null
  /** `pk_` = clé boutique (publique), `sk_` = clé serveur (secrète). */
  prefix: string | null
  start: string | null
  enabled: boolean
  referenceId: string
  expiresAt: string | null
  createdAt: string
  salesChannelIds?: string[]
  /** Only ever present on the create response (shown once). */
  key?: string
}

// --- Équipe ---------------------------------------------------------------------

export type StaffRole = 'owner' | 'manager' | 'fulfiller'

export interface AdminStaffUser {
  id: string
  email: string
  name: string | null
  role: string | null
  banned: boolean | null
  createdAt: string
}

export interface AdminInvite {
  id: string
  email: string
  role: string
  invitedBy: string | null
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
  /** Only ever present on the create response (shown once). */
  token?: string
}

// --- Notifications techniques (webhooks) ----------------------------------------

export interface AdminWebhookEndpoint {
  id: string
  url: string
  events: string[]
  active: boolean
  description: string | null
  createdAt: string
  /** Only ever present on create / rotate-secret responses (shown once). */
  secret?: string
}

export interface AdminWebhookDelivery {
  id: string
  endpointId: string
  eventType: string
  payload: unknown
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  lastError: string | null
  responseStatus: number | null
  nextAttemptAt: string
  deliveredAt: string | null
  createdAt: string
}

// --- Messages envoyés (notifications feed) --------------------------------------

export interface AdminNotification {
  id: string
  to: string
  channel: string
  template: string
  data: Record<string, unknown>
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  sentAt: string | null
  createdAt: string
}

// --- Navigation -----------------------------------------------------------------

export function useSettingsNav(): ComputedRef<PygSubNavItem[]> {
  const { t } = useVocabulary()
  return computed(() => [
    { label: t('setNavStore'), to: '/admin/settings', icon: 'i-lucide-store', exact: true },
    { label: t('setNavRegions'), to: '/admin/settings/regions', icon: 'i-lucide-globe' },
    { label: t('setNavTaxes'), to: '/admin/settings/taxes', icon: 'i-lucide-percent' },
    { label: t('setNavShipping'), to: '/admin/settings/shipping', icon: 'i-lucide-truck' },
    { label: t('setNavChannels'), to: '/admin/settings/channels', icon: 'i-lucide-radio' },
    { label: t('setNavKeys'), to: '/admin/settings/api-keys', icon: 'i-lucide-key-round' },
    { label: t('setNavTeam'), to: '/admin/settings/team', icon: 'i-lucide-users' },
    { label: t('setNavWebhooks'), to: '/admin/settings/webhooks', icon: 'i-lucide-webhook' },
    { label: t('setNavMessages'), to: '/admin/settings/messages', icon: 'i-lucide-send' },
  ])
}

// --- Statuses (icon + colour + label, never colour alone) ----------------------

export function deliveryStatusDisplay(status: AdminWebhookDelivery['status']): { tone: PygStatusTone; key: VocabKey } {
  if (status === 'delivered') return { tone: 'success', key: 'setDeliveryDelivered' }
  if (status === 'failed') return { tone: 'error', key: 'setDeliveryFailed' }
  return { tone: 'warning', key: 'setDeliveryPending' }
}

export function notificationStatusDisplay(status: AdminNotification['status']): { tone: PygStatusTone; key: VocabKey } {
  if (status === 'sent') return { tone: 'success', key: 'setMessageSent' }
  if (status === 'failed') return { tone: 'error', key: 'setMessageFailed' }
  return { tone: 'warning', key: 'setMessagePending' }
}

export function roleLabelKey(role: string | null): VocabKey {
  if (role === 'owner') return 'setRoleOwner'
  if (role === 'manager') return 'setRoleManager'
  if (role === 'fulfiller') return 'setRoleFulfiller'
  return 'setRoleUnknown'
}

export function inviteStatusDisplay(invite: AdminInvite): { tone: PygStatusTone; key: VocabKey } {
  if (invite.acceptedAt) return { tone: 'success', key: 'setInviteAccepted' }
  if (invite.revokedAt) return { tone: 'neutral', key: 'setInviteRevoked' }
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { tone: 'error', key: 'setInviteExpired' }
  return { tone: 'info', key: 'setInvitePending' }
}

// --- Domain events (webhook subscriptions) --------------------------------------

/**
 * The events the framework really emits, read from every `emitDomainEvent`
 * call in `@oumarbarry/pygmalion-core` + `@oumarbarry/pygmalion` — not an aspirational list.
 * Grouped so a picker of ~100 names stays navigable; `'*'` (every event) is
 * the default a non-technical user never has to leave.
 */
export interface DomainEventGroup {
  key: VocabKey
  events: string[]
}

export const DOMAIN_EVENT_GROUPS: readonly DomainEventGroup[] = [
  {
    key: 'setEventGroupOrders',
    events: ['order.placed', 'order.updated', 'order.canceled', 'order.archived', 'draft-order.created'],
  },
  {
    key: 'setEventGroupPayments',
    events: [
      'payment.captured',
      'payment.refunded',
      'payment.canceled',
      'payment-collection.created',
      'payment-session.created',
    ],
  },
  { key: 'setEventGroupCarts', events: ['cart.created', 'cart.updated'] },
  {
    key: 'setEventGroupProducts',
    events: [
      'product.created',
      'product.updated',
      'product.deleted',
      'product-variant.created',
      'product-variant.updated',
      'product-variant.deleted',
      'product-option.created',
      'product-option.updated',
      'product-option.deleted',
    ],
  },
  {
    key: 'setEventGroupCatalog',
    events: [
      'product-category.created',
      'product-category.updated',
      'product-category.deleted',
      'product-category.products-updated',
      'product-collection.created',
      'product-collection.updated',
      'product-collection.deleted',
      'product-collection.products-updated',
      'product-tag.created',
      'product-tag.updated',
      'product-tag.deleted',
    ],
  },
  {
    key: 'setEventGroupCustomers',
    events: [
      'customer.created',
      'customer.updated',
      'customer-address.created',
      'customer-address.updated',
      'customer-address.deleted',
      'customer-group.created',
      'customer-group.updated',
      'customer-group.deleted',
    ],
  },
  {
    key: 'setEventGroupPromotions',
    events: [
      'promotion.created',
      'promotion.updated',
      'promotion.deleted',
      'campaign.created',
      'campaign.updated',
      'campaign.deleted',
    ],
  },
  {
    key: 'setEventGroupStock',
    events: [
      'inventory-item.created',
      'inventory-item.updated',
      'inventory-item.deleted',
      'inventory-level.updated',
      'inventory-level.deleted',
      'reservation.created',
      'reservation.updated',
      'reservation.deleted',
      'stock-location.created',
      'stock-location.updated',
      'stock-location.deleted',
      'variant-inventory-item.linked',
      'variant-inventory-item.unlinked',
    ],
  },
  {
    key: 'setEventGroupPrices',
    events: [
      'price.batch-updated',
      'price-list.created',
      'price-list.updated',
      'price-list.deleted',
      'price-preference.created',
      'price-preference.updated',
      'price-preference.deleted',
    ],
  },
  {
    key: 'setEventGroupShipping',
    events: [
      'shipping-option.created',
      'shipping-option.updated',
      'shipping-option.deleted',
      'shipping-profile.created',
      'shipping-profile.updated',
      'shipping-profile.deleted',
      'shipping-profile.products-updated',
      'service-zone.created',
      'service-zone.updated',
      'service-zone.deleted',
      'fulfillment-set.created',
      'fulfillment-set.updated',
      'fulfillment-set.deleted',
    ],
  },
  {
    key: 'setEventGroupTaxes',
    events: [
      'tax-region.created',
      'tax-region.updated',
      'tax-region.deleted',
      'tax-rate.created',
      'tax-rate.updated',
      'tax-rate.deleted',
      'tax-rate-rule.created',
      'tax-rate-rule.deleted',
    ],
  },
  {
    key: 'setEventGroupSettings',
    events: [
      'store.created',
      'store.updated',
      'region.created',
      'region.updated',
      'region.deleted',
      'sales-channel.created',
      'sales-channel.updated',
      'sales-channel.deleted',
      'sales-channel.products-updated',
      'api-key.created',
      'api-key.revoked',
      'api-key.sales-channels-updated',
      'staff-invite.created',
      'return-reason.created',
      'refund-reason.created',
    ],
  },
]
