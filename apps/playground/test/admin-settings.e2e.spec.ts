import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface Store { id: string, name: string, defaultRegionId: string | null, defaultSalesChannelId: string | null }
interface Region { id: string, name: string, currencyCode: string, automaticTaxes: boolean }
interface Currency { code: string }
interface TaxRegion { id: string, countryCode: string, provinceCode: string | null, parentId: string | null }
interface TaxRateRule { id: string, reference: string, referenceId: string }
interface TaxRate { id: string, name: string, code: string, rate: number | null, isDefault: boolean, rules?: TaxRateRule[] }
interface FulfillmentSet { id: string, name: string }
interface ServiceZone { id: string, name: string }
interface GeoZone { id: string, type: string, countryCode: string }
interface ShippingProfile { id: string, name: string, isDefault: boolean }
interface ShippingOption { id: string, name: string, priceType: string, shippingProfileId: string }
interface SalesChannel { id: string, name: string, isDisabled: boolean }
interface ApiKey { id: string, name: string | null, prefix: string | null, enabled: boolean, key?: string }
interface Invite { id: string, email: string, role: string, revokedAt: string | null, token?: string }
interface StaffUser { id: string, email: string, role: string | null }
interface WebhookEndpoint { id: string, url: string, events: string[], active: boolean, secret?: string }
interface WebhookDelivery { id: string, endpointId: string, eventType: string, status: string, attempts: number }
interface Notification { id: string, to: string, template: string, status: string }
interface Product { id: string }

async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hit = await probe()
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/**
 * The admin *screens* of the Réglages section, exercised as flows
 * (same style as `admin-catalog.e2e.spec.ts`): each test replays the exact
 * call sequence one screen performs, in order, so a screen that silently
 * stops matching the API fails here. HTTP against a booted playground, no
 * browser.
 */
describe('admin settings screens (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    // Byte-identical to `admin-catalog.e2e.spec.ts` on purpose: @nuxt/test-utils
    // caches one build per distinct nuxtConfig, and a config of our own would
    // pay a second cold Nuxt build (>120s, past `setupTimeout`) for nothing —
    // this suite reads the delivery LOG, it doesn't need a tuned retry ladder.
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  let regionId: string
  let taxRegionId: string
  let taxRateId: string
  let fulfillmentSetId: string
  let serviceZoneId: string
  let profileId: string
  let channelId: string
  let endpointId: string

  it('signs a staff owner in (the sign-in screen)', async () => {
    ;({ cookie } = await seedOwnerSession('settings-screens-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  it('« Zones de vente » creates an area with its currency and countries, and lists it', async () => {
    // The screen fills its currency select from the reference table.
    const currencies = await $fetch<{ currencies: Currency[] }>('/api/admin/currencies', {
      headers: { cookie },
      query: { limit: 100 },
    })
    expect(currencies.currencies.some((c) => c.code === 'eur')).toBe(true)

    const created = await $fetch<{ region: Region }>('/api/admin/regions', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Europe', currencyCode: 'eur', automaticTaxes: true, countries: ['FR', 'BE'] },
    })
    regionId = created.region.id
    expect(regionId).toMatch(/^reg_/)
    expect(created.region.currencyCode).toBe('eur')

    const listed = await $fetch<{ regions: Region[] }>('/api/admin/regions', {
      headers: { cookie },
      query: { limit: 100 },
    })
    expect(listed.regions.some((r) => r.id === regionId)).toBe(true)
  })

  it('the area detail screen renames it and replaces the countries it serves', async () => {
    const updated = await $fetch<{ region: Region }>(`/api/admin/regions/${regionId}`, {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Zone euro', currencyCode: 'eur', automaticTaxes: false },
    })
    expect(updated.region.name).toBe('Zone euro')
    expect(updated.region.automaticTaxes).toBe(false)

    // The countries block posts on its own (replace-set) — see the page header.
    const replaced = await $fetch<{ region: Region }>(`/api/admin/regions/${regionId}`, {
      method: 'POST',
      headers: { cookie },
      body: { countries: ['FR', 'BE', 'ES'] },
    })
    expect(replaced.region.id).toBe(regionId)
  })

  it('« Boutique » saves the store name, its main area and its main channel', async () => {
    const stores = await $fetch<{ stores: Store[] }>('/api/admin/stores', { headers: { cookie } })
    const store = stores.stores[0]!
    const channels = await $fetch<{ salesChannels: SalesChannel[] }>('/api/admin/sales-channels', {
      headers: { cookie },
      query: { limit: 100 },
    })
    channelId = channels.salesChannels[0]!.id

    await $fetch(`/api/admin/stores/${store.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Ma jolie boutique', defaultRegionId: regionId, defaultSalesChannelId: channelId },
    })

    const after = await $fetch<{ store: Store }>(`/api/admin/stores/${store.id}`, { headers: { cookie } })
    expect(after.store.name).toBe('Ma jolie boutique')
    expect(after.store.defaultRegionId).toBe(regionId)
    // The screen derives the default currency from that area — no store column.
    const region = await $fetch<{ region: Region }>(`/api/admin/regions/${regionId}`, { headers: { cookie } })
    expect(region.region.currencyCode).toBe('eur')
  })

  it('« Taxes » adds a taxed country, a default rate and a reduced rate scoped to a product', async () => {
    const region = await $fetch<{ taxRegion: TaxRegion }>('/api/admin/tax-regions', {
      method: 'POST',
      headers: { cookie },
      body: { countryCode: 'fr' },
    })
    taxRegionId = region.taxRegion.id

    const standard = await $fetch<{ taxRate: TaxRate }>('/api/admin/tax-rates', {
      method: 'POST',
      headers: { cookie },
      body: { taxRegionId, name: 'TVA', code: 'TVA20', rate: 20, isDefault: true },
    })
    expect(standard.taxRate.rate).toBe(20)

    const reduced = await $fetch<{ taxRate: TaxRate }>('/api/admin/tax-rates', {
      method: 'POST',
      headers: { cookie },
      body: { taxRegionId, name: 'Taux réduit', code: 'TVA55', rate: 5.5, isDefault: false },
    })
    taxRateId = reduced.taxRate.id

    // « Produits au taux réduit » — the picker writes a `product` rule.
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Livre de cuisine' },
    })
    await $fetch(`/api/admin/tax-rates/${taxRateId}/rules`, {
      method: 'POST',
      headers: { cookie },
      body: { reference: 'product', referenceId: product.product.id },
    })

    const detail = await $fetch<{ taxRate: TaxRate }>(`/api/admin/tax-rates/${taxRateId}`, { headers: { cookie } })
    expect(detail.taxRate.rules).toHaveLength(1)
    expect(detail.taxRate.rules![0]!.referenceId).toBe(product.product.id)

    const listed = await $fetch<{ taxRates: TaxRate[] }>('/api/admin/tax-rates', {
      headers: { cookie },
      query: { tax_region_id: taxRegionId, limit: 100 },
    })
    expect(listed.taxRates).toHaveLength(2)

    // Removing the override leaves the rate itself alone.
    await $fetch(`/api/admin/tax-rates/${taxRateId}/rules/${detail.taxRate.rules![0]!.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    const after = await $fetch<{ taxRate: TaxRate }>(`/api/admin/tax-rates/${taxRateId}`, { headers: { cookie } })
    expect(after.taxRate.rules).toHaveLength(0)
  })

  it('« Livraison » creates a method, a delivered area with its countries, and a flat price', async () => {
    const set = await $fetch<{ fulfillmentSet: FulfillmentSet }>('/api/admin/fulfillment-sets', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Livraison à domicile' },
    })
    fulfillmentSetId = set.fulfillmentSet.id

    const zone = await $fetch<{ serviceZone: ServiceZone }>(
      `/api/admin/fulfillment-sets/${fulfillmentSetId}/service-zones`,
      {
        method: 'POST',
        headers: { cookie },
        body: {
          name: 'France',
          geoZones: [{ type: 'country', countryCode: 'fr' }],
        },
      },
    )
    serviceZoneId = zone.serviceZone.id

    // Unlike a selling area's countries, these ARE readable — the picker
    // round-trips.
    const zoneDetail = await $fetch<{ serviceZone: ServiceZone, geoZones: GeoZone[] }>(
      `/api/admin/fulfillment-sets/${fulfillmentSetId}/service-zones/${serviceZoneId}`,
      { headers: { cookie } },
    )
    expect(zoneDetail.geoZones.map((g) => g.countryCode)).toContain('fr')

    const profiles = await $fetch<{ shippingProfiles: ShippingProfile[] }>('/api/admin/shipping-profiles', {
      headers: { cookie },
      query: { limit: 100 },
    })
    profileId = profiles.shippingProfiles.find((p) => p.isDefault)?.id
      ?? (await $fetch<{ shippingProfile: ShippingProfile }>('/api/admin/shipping-profiles', {
        method: 'POST',
        headers: { cookie },
        body: { name: 'Standard', isDefault: true },
      })).shippingProfile.id

    // The screen's two calls: create the option, then price it (minor units).
    const option = await $fetch<{ shippingOption: ShippingOption }>('/api/admin/shipping-options', {
      method: 'POST',
      headers: { cookie },
      body: {
        name: 'Colissimo',
        serviceZoneId,
        shippingProfileId: profileId,
        providerId: 'manual',
        priceType: 'flat',
      },
    })
    await $fetch('/api/admin/prices/batch', {
      method: 'POST',
      headers: { cookie },
      body: { create: [{ shippingOptionId: option.shippingOption.id, currencyCode: 'eur', amount: 590 }] },
    })

    const listed = await $fetch<{ shippingOptions: ShippingOption[] }>('/api/admin/shipping-options', {
      headers: { cookie },
      query: { service_zone_id: serviceZoneId, limit: 100 },
    })
    expect(listed.shippingOptions.map((o) => o.id)).toContain(option.shippingOption.id)
    expect(listed.shippingOptions[0]!.priceType).toBe('flat')
  })

  it('« Canaux de vente » creates a channel and closes it', async () => {
    const created = await $fetch<{ salesChannel: SalesChannel }>('/api/admin/sales-channels', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Marché du samedi', description: 'Vente au comptoir' },
    })
    const id = created.salesChannel.id
    expect(created.salesChannel.isDisabled).toBe(false)

    const closed = await $fetch<{ salesChannel: SalesChannel }>(`/api/admin/sales-channels/${id}`, {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Marché du samedi', description: null, isDisabled: true },
    })
    expect(closed.salesChannel.isDisabled).toBe(true)

    await $fetch(`/api/admin/sales-channels/${id}`, { method: 'DELETE', headers: { cookie } })
  })

  it('« Clés boutique » shows the key exactly once, masks it afterwards, then revokes it', async () => {
    const created = await $fetch<{ apiKey: ApiKey }>('/api/admin/api-keys', {
      method: 'POST',
      headers: { cookie },
      body: { type: 'publishable', name: 'Site vitrine', salesChannelIds: [channelId] },
    })
    const keyId = created.apiKey.id
    expect(created.apiKey.key).toBeTruthy()

    const listed = await $fetch<{ apiKeys: ApiKey[] }>('/api/admin/api-keys', { headers: { cookie } })
    const listedKey = listed.apiKeys.find((k) => k.id === keyId)!
    expect(listedKey.key).toBeUndefined()
    expect(listedKey.enabled).toBe(true)
    expect(listedKey.prefix).toBe('pk_')

    await $fetch(`/api/admin/api-keys/${keyId}/revoke`, { method: 'POST', headers: { cookie } })

    const after = await $fetch<{ apiKeys: ApiKey[] }>('/api/admin/api-keys', { headers: { cookie } })
    expect(after.apiKeys.find((k) => k.id === keyId)!.enabled).toBe(false)
  })

  it('« Équipe » lists members, invites someone (link once) and cancels the invitation', async () => {
    const users = await $fetch<{ users: StaffUser[] }>('/api/admin/users', { headers: { cookie } })
    expect(users.users.some((u) => u.email === 'settings-screens-owner@test.pygmalion.dev')).toBe(true)
    const me = await $fetch<{ user: StaffUser }>('/api/admin/users/me', { headers: { cookie } })
    expect(me.user.role).toBe('owner')

    const created = await $fetch<{ invite: Invite }>('/api/admin/invites', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'gerant@test.pygmalion.dev', role: 'manager' },
    })
    const inviteId = created.invite.id
    // The screen turns this raw token into /admin/accept-invite?token=…
    expect(created.invite.token).toBeTruthy()

    const listed = await $fetch<{ invites: Invite[] }>('/api/admin/invites', { headers: { cookie } })
    const listedInvite = listed.invites.find((i) => i.id === inviteId)!
    expect(listedInvite.token).toBeUndefined()
    expect(listedInvite.revokedAt).toBeNull()

    await $fetch(`/api/admin/invites/${inviteId}`, { method: 'DELETE', headers: { cookie } })
    const after = await $fetch<{ invite: Invite }>(`/api/admin/invites/${inviteId}`, { headers: { cookie } })
    expect(after.invite.revokedAt).not.toBeNull()
  })

  it('« Messages envoyés » shows what the invite queued, filtered by recipient', async () => {
    const feed = await waitFor('the invite notification', async () => {
      const res = await $fetch<{ notifications: Notification[] }>('/api/admin/notifications', {
        headers: { cookie },
        query: { to: 'gerant@test.pygmalion.dev', limit: 20 },
      })
      return res.notifications.length ? res.notifications : null
    })
    expect(feed.every((n) => n.to === 'gerant@test.pygmalion.dev')).toBe(true)
  })

  it('« Notifications techniques » creates an endpoint (secret once), sees a delivery, redelivers it', async () => {
    const created = await $fetch<{ webhookEndpoint: WebhookEndpoint }>('/api/admin/webhook-endpoints', {
      method: 'POST',
      headers: { cookie },
      // Unroutable on purpose: this test is about the delivery LOG the screen
      // renders, not about a subscriber receiving it (webhooks.e2e covers that).
      body: { url: 'http://127.0.0.1:1/never', events: ['region.created'], description: 'Compta' },
    })
    endpointId = created.webhookEndpoint.id
    const secret = created.webhookEndpoint.secret
    expect(secret).toMatch(/^whsec_/)

    const listed = await $fetch<{ webhookEndpoints: WebhookEndpoint[] }>('/api/admin/webhook-endpoints', {
      headers: { cookie },
    })
    expect(listed.webhookEndpoints.find((e) => e.id === endpointId)!.secret).toBeUndefined()

    // An event the endpoint subscribes to.
    await $fetch('/api/admin/regions', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Suisse', currencyCode: 'eur' },
    })

    const delivery = await waitFor('the region.created delivery', async () => {
      const res = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>('/api/admin/webhook-deliveries', {
        headers: { cookie },
        query: { endpointId, limit: 50 },
      })
      return res.webhookDeliveries.find((d) => d.eventType === 'region.created') ?? null
    })
    expect(delivery.endpointId).toBe(endpointId)

    const before = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>('/api/admin/webhook-deliveries', {
      headers: { cookie },
      query: { endpointId, limit: 50 },
    })
    await $fetch(`/api/admin/webhook-deliveries/${delivery.id}/redeliver`, { method: 'POST', headers: { cookie } })
    const after = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>('/api/admin/webhook-deliveries', {
      headers: { cookie },
      query: { endpointId, limit: 50 },
    })
    // Append-only: a redelivery is a NEW row, the original keeps its outcome.
    expect(after.webhookDeliveries.length).toBeGreaterThan(before.webhookDeliveries.length)
  })

  it('the endpoint screen rotates the signing secret and turns the endpoint off', async () => {
    const rotated = await $fetch<{ webhookEndpoint: WebhookEndpoint }>(
      `/api/admin/webhook-endpoints/${endpointId}/rotate-secret`,
      { method: 'POST', headers: { cookie } },
    )
    expect(rotated.webhookEndpoint.secret).toMatch(/^whsec_/)

    const paused = await $fetch<{ webhookEndpoint: WebhookEndpoint }>(`/api/admin/webhook-endpoints/${endpointId}`, {
      method: 'POST',
      headers: { cookie },
      body: { active: false },
    })
    expect(paused.webhookEndpoint.active).toBe(false)

    await $fetch(`/api/admin/webhook-endpoints/${endpointId}`, { method: 'DELETE', headers: { cookie } })
  })

  it('deleting a selling area is refused while countries are still attached to it', async () => {
    // The PygConfirm copy says exactly this ("retirez d'abord tous ses pays").
    await expect(
      $fetch(`/api/admin/regions/${regionId}`, { method: 'DELETE', headers: { cookie } }),
    ).rejects.toThrow()

    await $fetch(`/api/admin/regions/${regionId}`, { method: 'POST', headers: { cookie }, body: { countries: [] } })
    const removed = await $fetch<{ region: Region }>(`/api/admin/regions/${regionId}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(removed.region.id).toBe(regionId)
  })

  it('cleans up the tax country the screens created', async () => {
    await $fetch(`/api/admin/tax-regions/${taxRegionId}`, { method: 'DELETE', headers: { cookie } })
    const listed = await $fetch<{ taxRegions: TaxRegion[] }>('/api/admin/tax-regions', {
      headers: { cookie },
      query: { limit: 100 },
    })
    expect(listed.taxRegions.some((r) => r.id === taxRegionId)).toBe(false)
  })
})
