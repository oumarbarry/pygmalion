import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createInventoryService } from './inventory'
import { createProductsService } from './products'

let db: PygmalionDatabase
let inventory: ReturnType<typeof createInventoryService>
let products: ReturnType<typeof createProductsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  inventory = createInventoryService({ db })
  products = createProductsService({ db })
})

async function seedVariant(overrides: { manageInventory?: boolean; allowBackorder?: boolean } = {}) {
  const product = await products.create({ title: 'T-Shirt' })
  const variant = await products.variants.create(product.id, {
    title: 'Default',
    manageInventory: overrides.manageInventory,
    allowBackorder: overrides.allowBackorder,
  })
  return { product, variant }
}

describe('stock locations', () => {
  it('create/get/update/list/soft-delete round-trip, with inline address', async () => {
    const loc = await inventory.locations.create({
      name: 'Warehouse EU',
      address: { address1: '1 Rue de la Paix', countryCode: 'fr' },
    })
    expect(loc.id).toMatch(/^sloc_/)
    expect(loc.addressId).toBeTruthy()

    const updated = await inventory.locations.update(loc.id, { name: 'Warehouse EU v2' })
    expect(updated?.name).toBe('Warehouse EU v2')
    expect((await inventory.locations.get(loc.id))?.name).toBe('Warehouse EU v2')
    expect((await inventory.locations.list({ q: 'warehouse' })).some((l) => l.id === loc.id)).toBe(true)

    const removed = await inventory.locations.remove(loc.id)
    expect(removed?.id).toBe(loc.id)
    expect(await inventory.locations.get(loc.id)).toBeNull()
  })
})

describe('inventory items + levels', () => {
  it('create item, upsert a level per location, and read it back', async () => {
    const item = await inventory.items.create({ sku: 'SKU-1' })
    const loc = await inventory.locations.create({ name: 'Main' })
    const level = await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })
    expect(level.stockedQuantity).toBe(10)
    expect(level.incomingQuantity).toBe(0)

    const updated = await inventory.levels.upsert(item.id, loc.id, { incomingQuantity: 5 })
    expect(updated.stockedQuantity).toBe(10)
    expect(updated.incomingQuantity).toBe(5)
  })
})

describe('availability by location (dispo par location)', () => {
  it('computes stocked/reserved/available per location independently, and aggregated across all locations', async () => {
    const item = await inventory.items.create({ sku: 'SKU-2' })
    const paris = await inventory.locations.create({ name: 'Paris' })
    const lyon = await inventory.locations.create({ name: 'Lyon' })
    await inventory.levels.upsert(item.id, paris.id, { stockedQuantity: 10 })
    await inventory.levels.upsert(item.id, lyon.id, { stockedQuantity: 4 })
    await inventory.reservations.create({ inventoryItemId: item.id, locationId: paris.id, quantity: 3 })

    expect(await inventory.availability(item.id, paris.id)).toEqual({ stocked: 10, reserved: 3, available: 7 })
    expect(await inventory.availability(item.id, lyon.id)).toEqual({ stocked: 4, reserved: 0, available: 4 })
    // No locationId -> aggregate across every location.
    expect(await inventory.availability(item.id)).toEqual({ stocked: 14, reserved: 3, available: 11 })
  })
})

describe('manage_inventory=false -> no reservation', () => {
  it('reserveVariants skips a variant with manage_inventory=false entirely', async () => {
    const { variant } = await seedVariant({ manageInventory: false })
    const loc = await inventory.locations.create({ name: 'Main' })

    const reservations = await inventory.reserveVariants({
      locationId: loc.id,
      items: [{ variantId: variant.id, quantity: 5 }],
    })

    expect(reservations).toEqual([])
    // No inventory item should even have been auto-created for it.
    expect(await inventory.items.listVariantLinks(variant.id)).toEqual([])
  })
})

describe('backorder beyond stock', () => {
  it('rejects a reservation beyond available stock when allow_backorder=false', async () => {
    const { variant } = await seedVariant({ allowBackorder: false })
    const loc = await inventory.locations.create({ name: 'Main' })
    const item = await inventory.items.create({ sku: 'SKU-NB' })
    await inventory.items.linkVariant(variant.id, { inventoryItemId: item.id })
    await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 2 })

    await expect(
      inventory.reserveVariants({ locationId: loc.id, items: [{ variantId: variant.id, quantity: 3 }] }),
    ).rejects.toThrow(/insufficient stock/)
    // Rejected reservation must not have partially persisted.
    expect((await inventory.availability(item.id, loc.id)).reserved).toBe(0)
  })

  it('allows a reservation beyond available stock when allow_backorder=true, and copies the flag', async () => {
    const { variant } = await seedVariant({ allowBackorder: true })
    const loc = await inventory.locations.create({ name: 'Main' })

    const reservations = await inventory.reserveVariants({
      locationId: loc.id,
      items: [{ variantId: variant.id, quantity: 5 }],
    })

    expect(reservations).toHaveLength(1)
    expect(reservations[0].allowBackorder).toBe(true)
    expect(reservations[0].quantity).toBe(5)
    const item = (await inventory.items.listVariantLinks(variant.id))[0]
    expect((await inventory.availability(item.inventoryItemId, loc.id)).available).toBe(-5)
  })
})

describe('kit required_quantity x qty', () => {
  it('a variant linked to multiple inventory items reserves each scaled by required_quantity', async () => {
    const { variant } = await seedVariant()
    const machine = await inventory.items.create({ sku: 'MACHINE' })
    const pods = await inventory.items.create({ sku: 'PODS' })
    await inventory.items.linkVariant(variant.id, { inventoryItemId: machine.id, requiredQuantity: 1 })
    await inventory.items.linkVariant(variant.id, { inventoryItemId: pods.id, requiredQuantity: 2 })
    const loc = await inventory.locations.create({ name: 'Main' })
    await inventory.levels.upsert(machine.id, loc.id, { stockedQuantity: 10 })
    await inventory.levels.upsert(pods.id, loc.id, { stockedQuantity: 10 })

    const reservations = await inventory.reserveVariants({
      locationId: loc.id,
      items: [{ variantId: variant.id, quantity: 3 }],
    })

    expect(reservations).toHaveLength(2)
    const byItem = new Map(reservations.map((r) => [r.inventoryItemId, r.quantity]))
    expect(byItem.get(machine.id)).toBe(3) // 1 * 3
    expect(byItem.get(pods.id)).toBe(6) // 2 * 3
  })

  it('auto-creates a 1:1 inventory item for a managed variant with no explicit kit link', async () => {
    const { variant } = await seedVariant()
    const loc = await inventory.locations.create({ name: 'Main' })
    expect(await inventory.items.listVariantLinks(variant.id)).toEqual([])

    // Give the (not-yet-existing) auto-item stock is impossible ahead of time,
    // so with default allow_backorder=false this must fail — proving an item
    // really did get created and its availability really was checked.
    await expect(
      inventory.reserveVariants({ locationId: loc.id, items: [{ variantId: variant.id, quantity: 1 }] }),
    ).rejects.toThrow(/insufficient stock/)
    const links = await inventory.items.listVariantLinks(variant.id)
    expect(links).toHaveLength(1)
    expect(links[0].requiredQuantity).toBe(1)
  })
})

describe('reservation -> decrement -> release cycle, state by state', () => {
  it('walks reserve -> fulfill (physical decrement) -> full release, checking availability at each step', async () => {
    const item = await inventory.items.create({ sku: 'SKU-CYCLE' })
    const loc = await inventory.locations.create({ name: 'Main' })
    await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })

    // 1. Reserve 4: stocked untouched, reserved=4, available=6.
    const reservation = await inventory.reservations.create({ inventoryItemId: item.id, locationId: loc.id, quantity: 4 })
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 10, reserved: 4, available: 6 })

    // 2. Fulfill (physical decrement) the full reserved quantity: stocked -4,
    //    reservation fully consumed -> deleted, reserved back to 0.
    const remainder = await inventory.fulfill(reservation.id, 4)
    expect(remainder).toBeNull()
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 6, reserved: 0, available: 6 })
    expect(await inventory.reservations.get(reservation.id)).toBeNull()

    // 3. Reserve again + release pre-fulfillment: only the reservation
    //    disappears, stocked stays exactly where fulfillment left it.
    const second = await inventory.reservations.create({ inventoryItemId: item.id, locationId: loc.id, quantity: 2 })
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 6, reserved: 2, available: 4 })
    await inventory.releaseReservations([second.id])
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 6, reserved: 0, available: 6 })
  })

  it('partial fulfillment shrinks the reservation instead of deleting it', async () => {
    const item = await inventory.items.create({ sku: 'SKU-PARTIAL' })
    const loc = await inventory.locations.create({ name: 'Main' })
    await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })
    const reservation = await inventory.reservations.create({ inventoryItemId: item.id, locationId: loc.id, quantity: 5 })

    const shrunk = await inventory.fulfill(reservation.id, 2)
    expect(shrunk?.quantity).toBe(3)
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 8, reserved: 3, available: 5 })
  })

  it('cancelFulfillment re-increments stocked_quantity and recreates the reservation (post-fulfillment cancel)', async () => {
    const item = await inventory.items.create({ sku: 'SKU-CANCEL' })
    const loc = await inventory.locations.create({ name: 'Main' })
    await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })
    const reservation = await inventory.reservations.create({ inventoryItemId: item.id, locationId: loc.id, quantity: 4 })
    await inventory.fulfill(reservation.id, 4)
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 6, reserved: 0, available: 6 })

    const restored = await inventory.cancelFulfillment({ inventoryItemId: item.id, locationId: loc.id, quantity: 4 })
    expect(restored.quantity).toBe(4)
    expect(await inventory.availability(item.id, loc.id)).toEqual({ stocked: 10, reserved: 4, available: 6 })
  })

  it('releaseByLineItem releases every reservation attached to a cart line', async () => {
    const item = await inventory.items.create({ sku: 'SKU-LINE' })
    const loc = await inventory.locations.create({ name: 'Main' })
    await inventory.levels.upsert(item.id, loc.id, { stockedQuantity: 10 })
    await inventory.reservations.create({ inventoryItemId: item.id, locationId: loc.id, quantity: 2, lineItemId: 'line_1' })
    await inventory.reservations.create({ inventoryItemId: item.id, locationId: loc.id, quantity: 1, lineItemId: 'line_1' })

    expect((await inventory.availability(item.id, loc.id)).reserved).toBe(3)
    await inventory.releaseByLineItem('line_1')
    expect((await inventory.availability(item.id, loc.id)).reserved).toBe(0)
  })
})
