import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface StockLocation {
  id: string
  name: string
  addressId: string | null
}
interface InventoryItem {
  id: string
  sku: string | null
}
interface Level {
  id: string
  stockedQuantity: number
  incomingQuantity: number
}
interface LocationLevel extends Level {
  locationId: string
  stocked: number
  reserved: number
  available: number
}
interface Reservation {
  id: string
  quantity: number
  allowBackorder: boolean
}
interface Product {
  id: string
}
interface Variant {
  id: string
}
interface Link {
  variantId: string
  inventoryItemId: string
  requiredQuantity: number
}

// Inventory items, stock locations, levels,
// reservations, variant<->inventory-item kit links): admin CRUD over HTTP +
// one full reserve -> fulfill -> release cycle exercised through the routes
// (unit coverage of the cycle itself lives in `packages/core`).
describe('inventory + stock locations (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  let cookie: string
  it('seeds a staff owner session', async () => {
    ;({ cookie } = await seedOwnerSession('inventory-owner@test.pygmalion.dev'))
    expect(cookie).toBeTruthy()
  })

  it('POST /api/admin/stock-locations creates a location with an inline address; GET lists/details it', async () => {
    const created = await $fetch<{ stockLocation: StockLocation }>('/api/admin/stock-locations', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Warehouse EU', address: { address1: '1 Rue de la Paix', countryCode: 'fr' } },
    })
    expect(created.stockLocation.id).toMatch(/^sloc_/)
    expect(created.stockLocation.addressId).toBeTruthy()

    const list = await $fetch<{ stockLocations: StockLocation[] }>('/api/admin/stock-locations', { headers: { cookie } })
    expect(list.stockLocations.some((l) => l.id === created.stockLocation.id)).toBe(true)

    const got = await $fetch<{ stockLocation: StockLocation }>(`/api/admin/stock-locations/${created.stockLocation.id}`, {
      headers: { cookie },
    })
    expect(got.stockLocation.name).toBe('Warehouse EU')
  })

  it('POST /api/admin/inventory-items creates an item; location-levels CRUD sets stock per location', async () => {
    const location = await $fetch<{ stockLocation: StockLocation }>('/api/admin/stock-locations', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Main DC' },
    })
    const item = await $fetch<{ inventoryItem: InventoryItem }>('/api/admin/inventory-items', {
      method: 'POST',
      headers: { cookie },
      body: { sku: 'E2E-SKU-1' },
    })
    expect(item.inventoryItem.id).toMatch(/^iitem_/)

    await $fetch(`/api/admin/inventory-items/${item.inventoryItem.id}/location-levels/${location.stockLocation.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { stockedQuantity: 20 },
    })
    const levels = await $fetch<{ locationLevels: LocationLevel[] }>(
      `/api/admin/inventory-items/${item.inventoryItem.id}/location-levels`,
      { headers: { cookie } },
    )
    expect(levels.locationLevels).toEqual([
      expect.objectContaining({ locationId: location.stockLocation.id, stocked: 20, reserved: 0, available: 20 }),
    ])
  })

  it('POST /api/admin/reservations reserves stock; DELETE releases it without touching stocked quantity', async () => {
    const location = await $fetch<{ stockLocation: StockLocation }>('/api/admin/stock-locations', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Reserve DC' },
    })
    const item = await $fetch<{ inventoryItem: InventoryItem }>('/api/admin/inventory-items', {
      method: 'POST',
      headers: { cookie },
      body: { sku: 'E2E-SKU-2' },
    })
    await $fetch(`/api/admin/inventory-items/${item.inventoryItem.id}/location-levels/${location.stockLocation.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { stockedQuantity: 10 },
    })

    const reservation = await $fetch<{ reservation: Reservation }>('/api/admin/reservations', {
      method: 'POST',
      headers: { cookie },
      body: { inventoryItemId: item.inventoryItem.id, locationId: location.stockLocation.id, quantity: 4 },
    })
    expect(reservation.reservation.quantity).toBe(4)

    const afterReserve = await $fetch<{ locationLevels: LocationLevel[] }>(
      `/api/admin/inventory-items/${item.inventoryItem.id}/location-levels`,
      { headers: { cookie } },
    )
    expect(afterReserve.locationLevels[0]).toMatchObject({ stocked: 10, reserved: 4, available: 6 })

    await $fetch(`/api/admin/reservations/${reservation.reservation.id}`, { method: 'DELETE', headers: { cookie } })
    const afterRelease = await $fetch<{ locationLevels: LocationLevel[] }>(
      `/api/admin/inventory-items/${item.inventoryItem.id}/location-levels`,
      { headers: { cookie } },
    )
    expect(afterRelease.locationLevels[0]).toMatchObject({ stocked: 10, reserved: 0, available: 10 })
  })

  it('rejects a reservation beyond available stock (no backorder) with a 422', async () => {
    const location = await $fetch<{ stockLocation: StockLocation }>('/api/admin/stock-locations', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Tight DC' },
    })
    const item = await $fetch<{ inventoryItem: InventoryItem }>('/api/admin/inventory-items', {
      method: 'POST',
      headers: { cookie },
      body: { sku: 'E2E-SKU-3' },
    })
    await $fetch(`/api/admin/inventory-items/${item.inventoryItem.id}/location-levels/${location.stockLocation.id}`, {
      method: 'POST',
      headers: { cookie },
      body: { stockedQuantity: 1 },
    })

    await expect(
      $fetch('/api/admin/reservations', {
        method: 'POST',
        headers: { cookie },
        body: { inventoryItemId: item.inventoryItem.id, locationId: location.stockLocation.id, quantity: 5 },
      }),
    ).rejects.toMatchObject({ statusCode: 422 })
  })

  it('links a variant to an inventory item (kit) and unlinks it', async () => {
    const product = await $fetch<{ product: Product }>('/api/admin/products', {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Coffee Kit' },
    })
    const variant = await $fetch<{ variant: Variant }>(`/api/admin/products/${product.product.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { title: 'Default' },
    })
    const item = await $fetch<{ inventoryItem: InventoryItem }>('/api/admin/inventory-items', {
      method: 'POST',
      headers: { cookie },
      body: { sku: 'E2E-KIT-POD' },
    })

    const link = await $fetch<{ link: Link }>(`/api/admin/inventory-items/${item.inventoryItem.id}/variants`, {
      method: 'POST',
      headers: { cookie },
      body: { variantId: variant.variant.id, requiredQuantity: 2 },
    })
    expect(link.link).toMatchObject({ variantId: variant.variant.id, inventoryItemId: item.inventoryItem.id, requiredQuantity: 2 })

    await $fetch(`/api/admin/inventory-items/${item.inventoryItem.id}/variants/${variant.variant.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
  })
})
