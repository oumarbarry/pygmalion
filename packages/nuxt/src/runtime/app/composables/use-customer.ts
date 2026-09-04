import type { CreateCustomerAddressInput, CustomerAddress, CustomerUser, UpdateCustomerAddressInput, UpdateCustomerInput } from '@oumarbarry/pygmalion-core'
import { PygmalionError } from '@oumarbarry/pygmalion-sdk'
import { computed } from 'vue'
import { useState } from 'nuxt/app'
import { usePygmalion } from './use-pygmalion'

/**
 * The signed-in customer (better-auth `customer` instance) and its address book.
 *
 * The session lives in the cookie better-auth sets — nothing is stored here but
 * the resolved profile, so SSR and the browser agree without a hydration hop.
 */
export function useCustomer() {
  const client = usePygmalion()
  const customer = useState<CustomerUser | null>('pygmalion:customer', () => null)
  const addresses = useState<CustomerAddress[]>('pygmalion:customer-addresses', () => [])

  /** Resolves the session. No session (401) is a normal storefront state, not an error. */
  async function refresh(): Promise<CustomerUser | null> {
    try {
      customer.value = (await client.store.customers.me()).customer
    } catch (err) {
      if (err instanceof PygmalionError && (err.status === 401 || err.status === 404)) customer.value = null
      else throw err
    }
    return customer.value
  }

  async function signUp(input: { email: string; password: string; name?: string }): Promise<CustomerUser | null> {
    await client.store.auth.signUp(input)
    return refresh()
  }

  async function signIn(input: { email: string; password: string }): Promise<CustomerUser | null> {
    await client.store.auth.signIn(input)
    return refresh()
  }

  async function signOut(): Promise<void> {
    await client.store.auth.signOut()
    customer.value = null
    addresses.value = []
  }

  async function update(body: UpdateCustomerInput): Promise<CustomerUser> {
    customer.value = (await client.store.customers.update(body)).customer
    return customer.value
  }

  async function refreshAddresses(): Promise<CustomerAddress[]> {
    addresses.value = (await client.store.customers.addresses.list()).addresses
    return addresses.value
  }

  async function addAddress(body: CreateCustomerAddressInput): Promise<CustomerAddress> {
    const { address } = await client.store.customers.addresses.create(body)
    await refreshAddresses()
    return address
  }

  async function updateAddress(id: string, body: UpdateCustomerAddressInput): Promise<CustomerAddress> {
    const { address } = await client.store.customers.addresses.update(id, body)
    await refreshAddresses()
    return address
  }

  async function removeAddress(id: string): Promise<void> {
    await client.store.customers.addresses.remove(id)
    await refreshAddresses()
  }

  return {
    customer,
    addresses,
    isAuthenticated: computed(() => customer.value !== null),
    refresh,
    signUp,
    signIn,
    signOut,
    update,
    refreshAddresses,
    addAddress,
    updateAddress,
    removeAddress,
  }
}
