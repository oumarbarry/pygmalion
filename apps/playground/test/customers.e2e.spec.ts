import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Customer {
  id: string
  email: string
  name: string
  phone: string | null
  hasAccount: boolean
}
interface Address {
  id: string
  city: string | null
  isDefaultShipping: boolean
}
interface CustomerGroup {
  id: string
  name: string
}

async function signUpCustomer(email: string, password = 'customer-pw-12345') {
  const res = await fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Test Customer' }),
  })
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`)
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('sign-up did not return a session cookie')
  return { cookie, password }
}

// Customers domain: better-auth `customer`
// instance (public sign-up), profile self-service, address book, guest
// coexistence with a registered account for the same email, admin
// customers + customer-groups CRUD.
describe('customers (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  it('GET /api/store/customers/me 401s with no session (storefront auth is optional, /me requires it)', async () => {
    await expect($fetch('/api/store/customers/me')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('signs a customer up via POST /api/auth/sign-up/email (public, unlike staff)', async () => {
    const res = await $fetch<{ user: { email: string } }>('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email: 'signup@test.pygmalion.dev', password: 'customer-pw-12345', name: 'Signup Customer' },
    })
    expect(res.user.email).toBe('signup@test.pygmalion.dev')
  })

  it('signs a customer in via POST /api/auth/sign-in/email', async () => {
    await signUpCustomer('login@test.pygmalion.dev')
    const res = await $fetch<{ user: { email: string } }>('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'login@test.pygmalion.dev', password: 'customer-pw-12345' },
    })
    expect(res.user.email).toBe('login@test.pygmalion.dev')
  })

  it('GET/PATCH /api/store/customers/me — profile self-service', async () => {
    const { cookie } = await signUpCustomer('me@test.pygmalion.dev')

    const before = await $fetch<{ customer: Customer }>('/api/store/customers/me', { headers: { cookie } })
    expect(before.customer.email).toBe('me@test.pygmalion.dev')
    expect(before.customer.hasAccount).toBe(true)

    const after = await $fetch<{ customer: Customer }>('/api/store/customers/me', {
      method: 'PATCH',
      headers: { cookie },
      body: { name: 'Updated Name', phone: '+15551234567' },
    })
    expect(after.customer.name).toBe('Updated Name')
    expect(after.customer.phone).toBe('+15551234567')
  })

  it('address book CRUD scoped to the caller, at most one default shipping address', async () => {
    const { cookie } = await signUpCustomer('addr@test.pygmalion.dev')

    const a1 = await $fetch<{ address: Address }>('/api/store/customers/me/addresses', {
      method: 'POST',
      headers: { cookie },
      body: { city: 'Paris', countryCode: 'FR', isDefaultShipping: true },
    })
    expect(a1.address.isDefaultShipping).toBe(true)

    const a2 = await $fetch<{ address: Address }>('/api/store/customers/me/addresses', {
      method: 'POST',
      headers: { cookie },
      body: { city: 'Lyon', countryCode: 'FR', isDefaultShipping: true },
    })
    expect(a2.address.isDefaultShipping).toBe(true)

    const list = await $fetch<{ addresses: Address[] }>('/api/store/customers/me/addresses', { headers: { cookie } })
    expect(list.addresses).toHaveLength(2)
    expect(list.addresses.find((a) => a.id === a1.address.id)?.isDefaultShipping).toBe(false)

    const updated = await $fetch<{ address: Address }>(`/api/store/customers/me/addresses/${a1.address.id}`, {
      method: 'PATCH',
      headers: { cookie },
      body: { city: 'Marseille' },
    })
    expect(updated.address.city).toBe('Marseille')

    await $fetch(`/api/store/customers/me/addresses/${a1.address.id}`, { method: 'DELETE', headers: { cookie } })
    const after = await $fetch<{ addresses: Address[] }>('/api/store/customers/me/addresses', { headers: { cookie } })
    expect(after.addresses).toHaveLength(1)
  })

  describe('guest customer coexists with a registered account for the same email', () => {
    it('a guest created for a brand-new email has hasAccount=false and is the only row', async () => {
      const res = await $fetch<{ guest: Customer, rowsForEmail: number }>('/api/_test/ensure-customer-guest', {
        method: 'POST',
        body: { email: 'guest-only@test.pygmalion.dev' },
      })
      expect(res.guest.hasAccount).toBe(false)
      expect(res.rowsForEmail).toBe(1)
    })

    it('is idempotent: ensuring the same guest email twice does not duplicate the row', async () => {
      const first = await $fetch<{ guest: Customer }>('/api/_test/ensure-customer-guest', {
        method: 'POST',
        body: { email: 'guest-repeat@test.pygmalion.dev' },
      })
      const second = await $fetch<{ guest: Customer, rowsForEmail: number }>('/api/_test/ensure-customer-guest', {
        method: 'POST',
        body: { email: 'guest-repeat@test.pygmalion.dev' },
      })
      expect(second.guest.id).toBe(first.guest.id)
      expect(second.rowsForEmail).toBe(1)
    })

    it('a registered account and a guest row COEXIST for the same email (two rows, unique on email+hasAccount)', async () => {
      const email = 'both@test.pygmalion.dev'
      // Account first (public sign-up succeeds — no row exists yet for this email).
      await signUpCustomer(email)
      // Then a guest is created for the SAME email (e.g. a checkout done
      // logged-out) — allowed because the unique index is (email, hasAccount),
      // not email alone.
      const res = await $fetch<{ guest: Customer, rowsForEmail: number }>('/api/_test/ensure-customer-guest', {
        method: 'POST',
        body: { email },
      })
      expect(res.guest.hasAccount).toBe(false)
      expect(res.rowsForEmail).toBe(2)
    })

    it('the reverse order is blocked by better-auth\'s own duplicate-email guard (documented limitation)', async () => {
      const email = 'guest-then-signup@test.pygmalion.dev'
      await $fetch('/api/_test/ensure-customer-guest', { method: 'POST', body: { email } })
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'customer-pw-12345', name: 'Too Late' }),
      })
      expect(res.ok).toBe(false)
    })
  })

  describe('admin: customers + customer-groups', () => {
    let staffCookie: string
    let customerId: string

    it('seeds a staff owner session and a customer to administer', async () => {
      ;({ cookie: staffCookie } = await seedOwnerSession('customers-admin-owner@test.pygmalion.dev'))
      const { cookie: customerCookie } = await signUpCustomer('admin-target@test.pygmalion.dev')
      const me = await $fetch<{ customer: Customer }>('/api/store/customers/me', { headers: { cookie: customerCookie } })
      customerId = me.customer.id
      expect(customerId).toMatch(/^cus_/)
    })

    it('401s /api/admin/customers with no staff session', async () => {
      await expect($fetch('/api/admin/customers')).rejects.toMatchObject({ statusCode: 401 })
    })

    it('GET /api/admin/customers lists it; GET/PATCH /:id manage it', async () => {
      const list = await $fetch<{ customers: Customer[] }>('/api/admin/customers', { headers: { cookie: staffCookie } })
      expect(list.customers.some((c) => c.id === customerId)).toBe(true)

      const got = await $fetch<{ customer: Customer }>(`/api/admin/customers/${customerId}`, {
        headers: { cookie: staffCookie },
      })
      expect(got.customer.email).toBe('admin-target@test.pygmalion.dev')

      const updated = await $fetch<{ customer: Customer }>(`/api/admin/customers/${customerId}`, {
        method: 'PATCH',
        headers: { cookie: staffCookie },
        body: { name: 'Renamed By Admin' },
      })
      expect(updated.customer.name).toBe('Renamed By Admin')
    })

    it('customer-groups CRUD + add/remove members', async () => {
      const created = await $fetch<{ group: CustomerGroup }>('/api/admin/customer-groups', {
        method: 'POST',
        headers: { cookie: staffCookie },
        body: { name: 'VIP' },
      })
      expect(created.group.id).toMatch(/^cgrp_/)

      const renamed = await $fetch<{ group: CustomerGroup }>(`/api/admin/customer-groups/${created.group.id}`, {
        method: 'PATCH',
        headers: { cookie: staffCookie },
        body: { name: 'VIP Gold' },
      })
      expect(renamed.group.name).toBe('VIP Gold')

      const added = await $fetch<{ members: { id: string }[] }>(
        `/api/admin/customer-groups/${created.group.id}/members`,
        { method: 'POST', headers: { cookie: staffCookie }, body: { add: [customerId] } },
      )
      expect(added.members.map((m) => m.id)).toContain(customerId)

      const withMembers = await $fetch<{ group: CustomerGroup & { members: { id: string }[] } }>(
        `/api/admin/customer-groups/${created.group.id}`,
        { headers: { cookie: staffCookie } },
      )
      expect(withMembers.group.members.map((m) => m.id)).toContain(customerId)

      const removed = await $fetch<{ members: { id: string }[] }>(
        `/api/admin/customer-groups/${created.group.id}/members`,
        { method: 'POST', headers: { cookie: staffCookie }, body: { remove: [customerId] } },
      )
      expect(removed.members.map((m) => m.id)).not.toContain(customerId)

      const list = await $fetch<{ groups: CustomerGroup[] }>('/api/admin/customer-groups', {
        headers: { cookie: staffCookie },
      })
      expect(list.groups.some((g) => g.id === created.group.id)).toBe(true)

      await $fetch(`/api/admin/customer-groups/${created.group.id}`, { method: 'DELETE', headers: { cookie: staffCookie } })
      await expect(
        $fetch(`/api/admin/customer-groups/${created.group.id}`, { headers: { cookie: staffCookie } }),
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
