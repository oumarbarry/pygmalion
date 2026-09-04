import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Customer { id: string; email: string; name: string; phone: string | null; hasAccount: boolean }
interface CustomerGroup { id: string; name: string; members?: { id: string; email: string }[] }
interface Address { id: string; city: string | null; isDefaultShipping: boolean }
interface Campaign { id: string; name: string; startsAt: string | null; endsAt: string | null; budget: { type: string; limitAmount: number | null; usedAmount: number } | null; promotions?: { id: string }[] }
interface Promotion {
  id: string
  code: string | null
  status: string
  type: string
  campaignId: string | null
  applicationMethod: { target: string; allocation: string; valueType: string; value: number } | null
  rules: { attribute: string; operator: string; values: string[] }[]
  targetRules: { attribute: string; values: string[] }[]
  buyRules: { attribute: string; values: string[] }[]
}

/**
 * The admin *screens* of the Clients and Promotions sections,
 * exercised as flows: each test replays the exact call sequence one screen
 * performs, in order, so a screen that silently stops matching the API fails
 * here. Same style as `admin-catalog.e2e.spec.ts` (HTTP against a booted
 * playground, no browser).
 *
 * The payload shapes asserted below are what `packages/admin`'s
 * `utils/promotion-form.ts` builds from the wizard's answers — that
 * translation itself is unit-tested next to the file.
 */
describe('admin clients & promotions screens (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  let groupId: string
  let customerId: string
  let addressId: string
  let campaignId: string
  let promotionId: string

  it('signs a staff owner in (the sign-in screen)', async () => {
    ;({ cookie } = await seedOwnerSession('clients-promos-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  // --- E3 Clients -------------------------------------------------------------

  it('the groupes screen creates a group and lists it', async () => {
    const created = await $fetch<{ group: CustomerGroup }>('/api/admin/customer-groups', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Fidèles' },
    })
    groupId = created.group.id
    expect(groupId).toMatch(/^cgrp_/)

    const { groups } = await $fetch<{ groups: CustomerGroup[] }>('/api/admin/customer-groups', {
      headers: { cookie },
      query: { limit: 100 },
    })
    expect(groups.map((g) => g.id)).toContain(groupId)
  })

  it('the clients screen creates a customer with no password and finds it by search', async () => {
    const created = await $fetch<{ customer: Customer }>('/api/admin/customers', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'awa@test.pygmalion.dev', name: 'Awa Diallo', phone: '+221770000000' },
    })
    customerId = created.customer.id
    expect(customerId).toMatch(/^cus_/)
    // A merchant-created customer is a guest until that email signs up.
    expect(created.customer.hasAccount).toBe(false)

    const byName = await $fetch<{ customers: Customer[] }>('/api/admin/customers', {
      headers: { cookie },
      query: { q: 'Awa', limit: 50 },
    })
    expect(byName.customers.map((c) => c.id)).toContain(customerId)

    const byEmail = await $fetch<{ customers: Customer[] }>('/api/admin/customers', {
      headers: { cookie },
      query: { q: 'awa@test', limit: 50 },
    })
    expect(byEmail.customers.map((c) => c.id)).toContain(customerId)
  })

  it('refuses a second customer on the same e-mail — the screen catches it by searching first (BLOCKED E3-B5)', async () => {
    // What the inline form does before posting: one search, exact e-mail
    // match -> « un client existe déjà avec cette adresse ».
    const { customers } = await $fetch<{ customers: Customer[] }>('/api/admin/customers', {
      headers: { cookie },
      query: { q: 'awa@test.pygmalion.dev', limit: 50 },
    })
    expect(customers.some((c) => c.email === 'awa@test.pygmalion.dev')).toBe(true)

    // And what the route does if it is posted anyway: it rejects — but with a
    // 500, not the 409 it means to send (the unique violation is in the
    // drizzle error's `cause`, the guard tests its `message`).
    await expect(
      $fetch('/api/admin/customers', {
        method: 'POST',
        headers: { cookie },
        body: { email: 'awa@test.pygmalion.dev', name: 'Doublon' },
      }),
    ).rejects.toThrow()
  })

  it('the fiche client puts the customer in the group, and both sides see it', async () => {
    await $fetch('/api/admin/customers/' + customerId + '/customer-groups', {
      method: 'POST',
      headers: { cookie },
      body: { add: [groupId] },
    })

    // « Ses groupes » on the customer's own page…
    const mine = await $fetch<{ customerGroups: CustomerGroup[] }>(`/api/admin/customers/${customerId}/customer-groups`, {
      headers: { cookie },
    })
    expect(mine.customerGroups.map((g) => g.id)).toEqual([groupId])

    // …and « Clients de ce groupe » on the group's page.
    const group = await $fetch<{ group: CustomerGroup }>(`/api/admin/customer-groups/${groupId}`, { headers: { cookie } })
    expect(group.group.members?.map((m) => m.id)).toContain(customerId)
  })

  it('the fiche client edits the profile without touching the e-mail', async () => {
    const updated = await $fetch<{ customer: Customer }>(`/api/admin/customers/${customerId}`, {
      method: 'PATCH',
      headers: { cookie },
      body: { name: 'Awa D.', phone: '+221771111111' },
    })
    expect(updated.customer.name).toBe('Awa D.')
    expect(updated.customer.email).toBe('awa@test.pygmalion.dev')
  })

  it('the fiche client adds, edits and deletes an address', async () => {
    const created = await $fetch<{ address: Address }>(`/api/admin/customers/${customerId}/addresses`, {
      method: 'POST',
      headers: { cookie },
      body: {
        addressName: 'Maison',
        firstName: 'Awa',
        lastName: 'Diallo',
        address1: '12 rue des Manguiers',
        city: 'Dakar',
        postalCode: '10000',
        countryCode: 'SN',
        isDefaultShipping: true,
      },
    })
    addressId = created.address.id
    expect(created.address.isDefaultShipping).toBe(true)

    const listed = await $fetch<{ addresses: Address[] }>(`/api/admin/customers/${customerId}/addresses`, { headers: { cookie } })
    expect(listed.addresses.map((a) => a.id)).toEqual([addressId])

    const patched = await $fetch<{ address: Address }>(`/api/admin/customers/${customerId}/addresses/${addressId}`, {
      method: 'PATCH',
      headers: { cookie },
      body: { city: 'Thiès' },
    })
    expect(patched.address.city).toBe('Thiès')

    await $fetch(`/api/admin/customers/${customerId}/addresses/${addressId}`, { method: 'DELETE', headers: { cookie } })
    const afterDelete = await $fetch<{ addresses: Address[] }>(`/api/admin/customers/${customerId}/addresses`, { headers: { cookie } })
    expect(afterDelete.addresses).toEqual([])
  })

  it('« Ses commandes » scans the orders list (no customerId filter exists — BLOCKED E3-B1)', async () => {
    const { orders } = await $fetch<{ orders: { customerId: string | null }[] }>('/api/admin/orders', {
      headers: { cookie },
      query: { limit: 100 },
    })
    expect(orders.filter((o) => o.customerId === customerId)).toEqual([])
  })

  it('the fiche client takes the customer back out of the group', async () => {
    await $fetch(`/api/admin/customers/${customerId}/customer-groups`, {
      method: 'POST',
      headers: { cookie },
      body: { remove: [groupId] },
    })
    const mine = await $fetch<{ customerGroups: CustomerGroup[] }>(`/api/admin/customers/${customerId}/customer-groups`, {
      headers: { cookie },
    })
    expect(mine.customerGroups).toEqual([])

    // Put it back: the promotion below is reserved for this group.
    await $fetch(`/api/admin/customer-groups/${groupId}/members`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [customerId] },
    })
  })

  // --- E4 Promotions ----------------------------------------------------------

  it('the assistant creates the campaign that carries the budget and the dates', async () => {
    const created = await $fetch<{ campaign: Campaign }>('/api/admin/campaigns', {
      method: 'POST',
      headers: { cookie },
      body: {
        name: 'ETE10',
        startsAt: '2026-06-01',
        endsAt: '2026-08-31',
        budget: { type: 'spend', currencyCode: 'eur', limitAmount: 20000 },
      },
    })
    campaignId = created.campaign.id
    expect(created.campaign.budget).toMatchObject({ type: 'spend', limitAmount: 20000, usedAmount: 0 })
    expect(created.campaign.endsAt).toBeTruthy()
  })

  it('the assistant then creates a « −10 % réservé aux fidèles, dès 50 € » promotion', async () => {
    const created = await $fetch<{ promotion: Promotion }>('/api/admin/promotions', {
      method: 'POST',
      headers: { cookie },
      body: {
        code: 'ETE10',
        isAutomatic: false,
        status: 'active',
        type: 'standard',
        campaignId,
        rules: [
          { attribute: 'cart_subtotal', operator: 'gte', values: ['5000'] },
          { attribute: 'customer_group_id', operator: 'in', values: [groupId] },
        ],
        applicationMethod: {
          target: 'order',
          allocation: 'across',
          valueType: 'percentage',
          value: 10,
          targetRules: [],
          buyRules: [],
        },
      },
    })
    promotionId = created.promotion.id
    expect(promotionId).toMatch(/^promo_/)
    expect(created.promotion.status).toBe('active')
    expect(created.promotion.applicationMethod).toMatchObject({ target: 'order', valueType: 'percentage', value: 10 })
    expect(created.promotion.rules.map((r) => r.attribute).sort()).toEqual(['cart_subtotal', 'customer_group_id'])
  })

  it('the promotions list shows it, and its detail feeds the « Réduction / S’applique à » columns', async () => {
    const { promotions } = await $fetch<{ promotions: { id: string; status: string }[] }>('/api/admin/promotions', {
      headers: { cookie },
      query: { limit: 50 },
    })
    const row = promotions.find((p) => p.id === promotionId)
    expect(row?.status).toBe('active')

    // The list row is raw (BLOCKED E4-B1): the screen enriches it with the detail.
    const detail = await $fetch<{ promotion: Promotion }>(`/api/admin/promotions/${promotionId}`, { headers: { cookie } })
    expect(detail.promotion.applicationMethod?.value).toBe(10)
    expect(detail.promotion.campaignId).toBe(campaignId)
  })

  it('« pour 2 achetés, 1 offert » is a buyget at 100% carrying both quantities', async () => {
    const created = await $fetch<{ promotion: Promotion }>('/api/admin/promotions', {
      method: 'POST',
      headers: { cookie },
      body: {
        code: 'DEUXPOURUN',
        isAutomatic: false,
        status: 'active',
        type: 'buyget',
        rules: [],
        applicationMethod: {
          target: 'order',
          allocation: 'each',
          valueType: 'percentage',
          value: 100,
          buyRulesMinQuantity: 2,
          applyToQuantity: 1,
          targetRules: [],
          buyRules: [],
        },
      },
    })
    expect(created.promotion.type).toBe('buyget')
    expect(created.promotion.applicationMethod).toMatchObject({ valueType: 'percentage', value: 100 })

    // No budget, no dates -> no campaign was created for it.
    expect(created.promotion.campaignId).toBeNull()
  })

  it('the campaign screen attaches and detaches a promotion', async () => {
    const { promotions } = await $fetch<{ promotions: { id: string }[] }>('/api/admin/promotions', {
      headers: { cookie },
      query: { limit: 50 },
    })
    const other = promotions.find((p) => p.id !== promotionId)!
    await $fetch(`/api/admin/campaigns/${campaignId}/promotions`, {
      method: 'POST',
      headers: { cookie },
      body: { add: [other.id] },
    })
    let campaign = await $fetch<{ campaign: Campaign }>(`/api/admin/campaigns/${campaignId}`, { headers: { cookie } })
    expect(campaign.campaign.promotions?.map((p) => p.id).sort()).toEqual([other.id, promotionId].sort())

    await $fetch(`/api/admin/campaigns/${campaignId}/promotions`, {
      method: 'POST',
      headers: { cookie },
      body: { remove: [other.id] },
    })
    campaign = await $fetch<{ campaign: Campaign }>(`/api/admin/campaigns/${campaignId}`, { headers: { cookie } })
    expect(campaign.campaign.promotions?.map((p) => p.id)).toEqual([promotionId])
  })

  it('the edit screen changes the discount without touching the promotion kind', async () => {
    const updated = await $fetch<{ promotion: Promotion }>(`/api/admin/promotions/${promotionId}`, {
      method: 'POST',
      headers: { cookie },
      body: {
        code: 'ETE15',
        campaignId,
        rules: [{ attribute: 'customer_group_id', operator: 'in', values: [groupId] }],
        applicationMethod: { target: 'order', allocation: 'across', valueType: 'percentage', value: 15, targetRules: [], buyRules: [] },
      },
    })
    expect(updated.promotion.code).toBe('ETE15')
    expect(updated.promotion.applicationMethod?.value).toBe(15)
    expect(updated.promotion.rules.map((r) => r.attribute)).toEqual(['customer_group_id'])
  })

  it('« Arrêter » deactivates it, and it can be started again', async () => {
    const stopped = await $fetch<{ promotion: Promotion }>(`/api/admin/promotions/${promotionId}`, {
      method: 'POST',
      headers: { cookie },
      body: { status: 'inactive' },
    })
    expect(stopped.promotion.status).toBe('inactive')

    const started = await $fetch<{ promotion: Promotion }>(`/api/admin/promotions/${promotionId}`, {
      method: 'POST',
      headers: { cookie },
      body: { status: 'active' },
    })
    expect(started.promotion.status).toBe('active')
  })

  it('deleting a promotion takes it out of the list', async () => {
    await $fetch(`/api/admin/promotions/${promotionId}`, { method: 'DELETE', headers: { cookie } })
    const { promotions } = await $fetch<{ promotions: { id: string }[] }>('/api/admin/promotions', {
      headers: { cookie },
      query: { limit: 50 },
    })
    expect(promotions.map((p) => p.id)).not.toContain(promotionId)
  })

  it('deleting a group leaves its customers alone', async () => {
    await $fetch(`/api/admin/customer-groups/${groupId}`, { method: 'DELETE', headers: { cookie } })
    const { groups } = await $fetch<{ groups: CustomerGroup[] }>('/api/admin/customer-groups', {
      headers: { cookie },
      query: { limit: 100 },
    })
    expect(groups.map((g) => g.id)).not.toContain(groupId)

    const customer = await $fetch<{ customer: Customer }>(`/api/admin/customers/${customerId}`, { headers: { cookie } })
    expect(customer.customer.id).toBe(customerId)
  })
})
