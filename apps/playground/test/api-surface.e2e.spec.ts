import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Provider { id: string }
interface Id { id: string }

// Store reference data (regions, currencies, return reasons), provider
// registries, price-preferences, refund reasons, customer addresses on the
// admin side.
describe('API surface (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: { runtimeConfig: { pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 } } },
  })

  let cookie: string
  it('seeds a staff owner session', async () => {
    ;({ cookie } = await seedOwnerSession('surface-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  // --- Registres de providers ----------------------------------------------

  it('GET /api/admin/tax-providers lists the registered tax providers', async () => {
    const { taxProviders } = await $fetch<{ taxProviders: Provider[] }>('/api/admin/tax-providers', { headers: { cookie } })
    expect(taxProviders.map((p) => p.id)).toContain('system')
  })

  it('GET /api/admin/payments/payment-providers lists the payment providers', async () => {
    const { paymentProviders } = await $fetch<{ paymentProviders: Provider[] }>('/api/admin/payments/payment-providers', { headers: { cookie } })
    expect(paymentProviders.map((p) => p.id)).toContain('manual')
  })

  it('GET /api/admin/fulfillment-providers lists the fulfillment providers', async () => {
    const { fulfillmentProviders } = await $fetch<{ fulfillmentProviders: Provider[] }>('/api/admin/fulfillment-providers', { headers: { cookie } })
    expect(fulfillmentProviders.map((p) => p.id)).toContain('manual')
  })

  it('GET /api/store/payment-providers is public (no staff cookie)', async () => {
    const { paymentProviders } = await $fetch<{ paymentProviders: Provider[] }>('/api/store/payment-providers')
    expect(paymentProviders.map((p) => p.id)).toContain('manual')
  })

  it('/api/admin/tax-providers refuses an anonymous caller', async () => {
    await expect($fetch('/api/admin/tax-providers')).rejects.toMatchObject({ statusCode: 401 })
  })

  // --- Store reference data-------------------------------------------------

  let regionId: string
  it('seeds a region', async () => {
    regionId = (await $fetch<{ region: Id }>('/api/admin/regions', {
      method: 'POST', headers: { cookie }, body: { name: 'Surface Region', currencyCode: 'usd' },
    })).region.id
  })

  it('GET /api/store/regions + /:id are public and paginated', async () => {
    const { regions } = await $fetch<{ regions: Id[] }>('/api/store/regions?limit=5')
    expect(regions.some((r) => r.id === regionId)).toBe(true)
    const { region } = await $fetch<{ region: { id: string; name: string } }>(`/api/store/regions/${regionId}`)
    expect(region.name).toBe('Surface Region')
    await expect($fetch('/api/store/regions/reg_nope')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('GET /api/store/currencies + /:code are public', async () => {
    const { currencies } = await $fetch<{ currencies: { code: string }[] }>('/api/store/currencies?q=usd')
    expect(currencies.some((c) => c.code === 'usd')).toBe(true)
    const { currency } = await $fetch<{ currency: { code: string } }>('/api/store/currencies/USD')
    expect(currency.code).toBe('usd')
  })

  it('GET /api/store/return-reasons + /:id expose the referential to the storefront', async () => {
    const created = (await $fetch<{ returnReason: Id }>('/api/admin/return-reasons', {
      method: 'POST', headers: { cookie }, body: { value: 'too_big', label: 'Too big' },
    })).returnReason
    const { returnReasons } = await $fetch<{ returnReasons: Id[] }>('/api/store/return-reasons')
    expect(returnReasons.some((r) => r.id === created.id)).toBe(true)
    const { returnReason } = await $fetch<{ returnReason: { label: string } }>(`/api/store/return-reasons/${created.id}`)
    expect(returnReason.label).toBe('Too big')
  })

  // --- Admin: price-preferences---------------------------------------------

  it('CRUD /api/admin/price-preferences', async () => {
    const created = (await $fetch<{ pricePreference: Id }>('/api/admin/price-preferences', {
      method: 'POST', headers: { cookie }, body: { attribute: 'currency_code', value: 'usd', isTaxInclusive: true },
    })).pricePreference
    expect(created.id).toMatch(/^prpref_/)

    const { pricePreferences } = await $fetch<{ pricePreferences: Id[] }>('/api/admin/price-preferences', { headers: { cookie } })
    expect(pricePreferences.some((p) => p.id === created.id)).toBe(true)

    const updated = await $fetch<{ pricePreference: { isTaxInclusive: boolean } }>(`/api/admin/price-preferences/${created.id}`, {
      method: 'POST', headers: { cookie }, body: { isTaxInclusive: false },
    })
    expect(updated.pricePreference.isTaxInclusive).toBe(false)

    await $fetch(`/api/admin/price-preferences/${created.id}`, { method: 'DELETE', headers: { cookie } })
    await expect($fetch(`/api/admin/price-preferences/${created.id}`, { headers: { cookie } })).rejects.toMatchObject({ statusCode: 404 })
  })

  // --- Admin: refund-reasons------------------------------------------------

  it('CRUD /api/admin/refund-reasons', async () => {
    const created = (await $fetch<{ refundReason: Id }>('/api/admin/refund-reasons', {
      method: 'POST', headers: { cookie }, body: { code: 'damaged', label: 'Damaged' },
    })).refundReason
    expect(created.id).toMatch(/^refr_/)
    const { refundReasons } = await $fetch<{ refundReasons: Id[] }>('/api/admin/refund-reasons', { headers: { cookie } })
    expect(refundReasons.some((r) => r.id === created.id)).toBe(true)
    const updated = await $fetch<{ refundReason: { label: string } }>(`/api/admin/refund-reasons/${created.id}`, {
      method: 'POST', headers: { cookie }, body: { label: 'Damaged on arrival' },
    })
    expect(updated.refundReason.label).toBe('Damaged on arrival')
    await $fetch(`/api/admin/refund-reasons/${created.id}`, { method: 'DELETE', headers: { cookie } })
    await expect($fetch(`/api/admin/refund-reasons/${created.id}`, { headers: { cookie } })).rejects.toMatchObject({ statusCode: 404 })
  })

  // --- Admin: clients (création + adresses + groupes) -----------------------

  it('creates a customer, manages its addresses and its group membership', async () => {
    const { customer } = await $fetch<{ customer: Id }>('/api/admin/customers', {
      method: 'POST', headers: { cookie }, body: { email: 'phone-order@test.pygmalion.dev', name: 'Phone Order' },
    })
    expect(customer.id).toMatch(/^cus_/)

    const { address } = await $fetch<{ address: Id }>(`/api/admin/customers/${customer.id}/addresses`, {
      method: 'POST', headers: { cookie }, body: { city: 'Lyon', countryCode: 'FR' },
    })
    const { addresses } = await $fetch<{ addresses: Id[] }>(`/api/admin/customers/${customer.id}/addresses`, { headers: { cookie } })
    expect(addresses).toHaveLength(1)
    const single = await $fetch<{ address: { city: string } }>(`/api/admin/customers/${customer.id}/addresses/${address.id}`, { headers: { cookie } })
    expect(single.address.city).toBe('Lyon')
    const patched = await $fetch<{ address: { city: string } }>(`/api/admin/customers/${customer.id}/addresses/${address.id}`, {
      method: 'PATCH', headers: { cookie }, body: { city: 'Marseille' },
    })
    expect(patched.address.city).toBe('Marseille')

    const { group } = await $fetch<{ group: Id }>('/api/admin/customer-groups', {
      method: 'POST', headers: { cookie }, body: { name: 'VIP' },
    })
    await $fetch(`/api/admin/customers/${customer.id}/customer-groups`, {
      method: 'POST', headers: { cookie }, body: { add: [group.id] },
    })
    const { customerGroups } = await $fetch<{ customerGroups: Id[] }>(`/api/admin/customers/${customer.id}/customer-groups`, { headers: { cookie } })
    expect(customerGroups.map((g) => g.id)).toContain(group.id)

    await $fetch(`/api/admin/customers/${customer.id}/addresses/${address.id}`, { method: 'DELETE', headers: { cookie } })
    expect((await $fetch<{ addresses: Id[] }>(`/api/admin/customers/${customer.id}/addresses`, { headers: { cookie } })).addresses).toHaveLength(0)
  })

  // --- Admin: profil courant + détail d'invitation --------------------------

  it('GET /api/admin/users/me returns the signed-in staff profile', async () => {
    const { user } = await $fetch<{ user: { email: string; role: string } }>('/api/admin/users/me', { headers: { cookie } })
    expect(user.email).toBe('surface-owner@test.pygmalion.dev')
    expect(user.role).toBe('owner')
  })

  it('GET /api/admin/invites/:id returns one invite (never its token)', async () => {
    const { invite } = await $fetch<{ invite: Id }>('/api/admin/invites', {
      method: 'POST', headers: { cookie }, body: { email: 'invitee@test.pygmalion.dev', role: 'manager' },
    })
    const got = await $fetch<{ invite: Record<string, unknown> }>(`/api/admin/invites/${invite.id}`, { headers: { cookie } })
    expect(got.invite.email).toBe('invitee@test.pygmalion.dev')
    expect(got.invite.token).toBeUndefined()
    await expect($fetch('/api/admin/invites/inv_nope', { headers: { cookie } })).rejects.toMatchObject({ statusCode: 404 })
  })
})
