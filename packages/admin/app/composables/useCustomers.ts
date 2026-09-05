import type { PygStatusTone } from '../components/PygStatus.vue'
import type { PygSubNavItem } from '../components/PygSubNav.vue'
import type { VocabKey } from '../utils/vocabulary'

/**
 * Shared shapes + helpers for the Clients section. Same rule as
 * `useCatalog.ts`: types mirror what `/api/admin/**` really returns
 * (packages/core `customers` / `customer-groups` services) and are declared
 * here rather than imported from @oumarbarry/pygmalion-core, so the admin layer stays a
 * pure UI package.
 */

export interface AdminCustomer {
  id: string
  name: string
  email: string
  phone: string | null
  /** `false` = guest: the row exists, the person never created a password. */
  hasAccount: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminCustomerAddress {
  id: string
  customerId: string
  addressName: string | null
  isDefaultShipping: boolean
  isDefaultBilling: boolean
  company: string | null
  firstName: string | null
  lastName: string | null
  address1: string | null
  address2: string | null
  city: string | null
  countryCode: string | null
  province: string | null
  postalCode: string | null
  phone: string | null
}

export interface AdminCustomerGroup {
  id: string
  name: string
  createdAt: string
}

/** `GET /api/admin/customer-groups/:id` hydrates its members with these three fields only. */
export interface AdminGroupMember {
  id: string
  email: string
  name: string
}

/**
 * What the address form binds to: every text field is a plain string ('' for
 * "not filled in"), never `null` — an input's `model-value` cannot be null.
 * `addressBody` maps back to the API's nullable columns.
 */
export interface AddressDraft {
  addressName: string
  isDefaultShipping: boolean
  isDefaultBilling: boolean
  company: string
  firstName: string
  lastName: string
  address1: string
  address2: string
  city: string
  countryCode: string
  province: string
  postalCode: string
  phone: string
}

export function emptyAddressDraft(): AddressDraft {
  return {
    addressName: '',
    isDefaultShipping: false,
    isDefaultBilling: false,
    company: '',
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    countryCode: '',
    province: '',
    postalCode: '',
    phone: '',
  }
}

/**
 * `POST/PATCH .../addresses` refuses `''` on a 2-letter country and stores
 * empty strings as empty strings — send `null` for "not filled in" instead.
 */
export function addressBody(draft: AddressDraft): Record<string, unknown> {
  const clean = (v: string) => {
    const trimmed = v.trim()
    return trimmed.length ? trimmed : null
  }
  return {
    addressName: clean(draft.addressName),
    isDefaultShipping: draft.isDefaultShipping,
    isDefaultBilling: draft.isDefaultBilling,
    company: clean(draft.company),
    firstName: clean(draft.firstName),
    lastName: clean(draft.lastName),
    address1: clean(draft.address1),
    address2: clean(draft.address2),
    city: clean(draft.city),
    countryCode: clean(draft.countryCode),
    province: clean(draft.province),
    postalCode: clean(draft.postalCode),
    phone: clean(draft.phone),
  }
}

/** An existing address -> the form's shape (nullable columns become ''). */
export function addressToDraft(address: AdminCustomerAddress): AddressDraft {
  const text = (v: string | null) => v ?? ''
  return {
    addressName: text(address.addressName),
    isDefaultShipping: address.isDefaultShipping,
    isDefaultBilling: address.isDefaultBilling,
    company: text(address.company),
    firstName: text(address.firstName),
    lastName: text(address.lastName),
    address1: text(address.address1),
    address2: text(address.address2),
    city: text(address.city),
    countryCode: text(address.countryCode),
    province: text(address.province),
    postalCode: text(address.postalCode),
    phone: text(address.phone),
  }
}

/** One readable line out of an address, for the list of a customer's addresses. */
export function addressLine(address: AdminCustomerAddress): string {
  return [address.address1, address.address2, address.postalCode, address.city, address.countryCode]
    .filter((part) => part && part.trim().length)
    .join(' · ')
}

/** Second-level nav of the « Clients » section: the 6-item sidebar never grows. */
export function useCustomersNav(): ComputedRef<PygSubNavItem[]> {
  const { t } = useVocabulary()
  return computed(() => [
    { label: t('navCustomersList'), to: '/admin/customers', icon: 'i-lucide-users', exact: true },
    { label: t('navCustomerGroups'), to: '/admin/customers/groups', icon: 'i-lucide-users-round' },
  ])
}

/** Guest vs account: icon + colour + label, never colour alone. */
export function customerKindDisplay(hasAccount: boolean): { tone: PygStatusTone; key: VocabKey; icon: string } {
  return hasAccount
    ? { tone: 'success', key: 'cusKindAccount', icon: 'i-lucide-user-check' }
    : { tone: 'neutral', key: 'cusKindGuest', icon: 'i-lucide-user' }
}
