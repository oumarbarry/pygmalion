import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { pygId } from '../id'
import { inventoryItems, stockLocations } from '../schema/inventory'
import { createDbInventoryProvider, type InventoryProvider } from './inventory-provider'

let db: PygmalionDatabase
let provider: InventoryProvider

beforeEach(async () => {
  db = await createTestDb(schema)
  provider = createDbInventoryProvider({ db })
})

async function seedItemAndLocation(stocked: number) {
  const [item] = await db.insert(inventoryItems).values({ id: pygId('iitem'), sku: 'SKU' }).returning()
  const [loc] = await db.insert(stockLocations).values({ id: pygId('sloc'), name: 'Main' }).returning()
  await db.insert(schema.inventoryLevels).values({ id: pygId('ilev'), inventoryItemId: item.id, locationId: loc.id, stockedQuantity: stocked })
  return { item, loc }
}

describe('InventoryProvider (DB-backed default)', () => {
  it('check() treats a missing level as zero stock', async () => {
    const [item] = await db.insert(inventoryItems).values({ id: pygId('iitem'), sku: 'NOSTOCK' }).returning()
    expect(await provider.check(item.id)).toEqual({ stocked: 0, reserved: 0, available: 0 })
  })

  it('reserve() batch rolls back entirely if one item is insufficient', async () => {
    const { item: a, loc } = await seedItemAndLocation(5)
    const [b] = await db.insert(inventoryItems).values({ id: pygId('iitem'), sku: 'B' }).returning()
    await db.insert(schema.inventoryLevels).values({ id: pygId('ilev'), inventoryItemId: b.id, locationId: loc.id, stockedQuantity: 1 })

    await expect(
      provider.reserve([
        { inventoryItemId: a.id, locationId: loc.id, quantity: 2 },
        { inventoryItemId: b.id, locationId: loc.id, quantity: 5 }, // insufficient, no backorder
      ]),
    ).rejects.toThrow(/insufficient stock/)

    // The first item's reservation must not have persisted either.
    expect((await provider.check(a.id, loc.id)).reserved).toBe(0)
  })

  it('adjust() refuses to drive stocked_quantity negative', async () => {
    const { item, loc } = await seedItemAndLocation(3)
    await expect(provider.adjust(item.id, loc.id, -10)).rejects.toThrow(/negative/)
    expect((await provider.check(item.id, loc.id)).stocked).toBe(3)
  })

  it('adjust() throws on a missing level rather than silently creating one', async () => {
    const [item] = await db.insert(inventoryItems).values({ id: pygId('iitem'), sku: 'NOLEVEL' }).returning()
    const [loc] = await db.insert(stockLocations).values({ id: pygId('sloc'), name: 'Nowhere' }).returning()
    await expect(provider.adjust(item.id, loc.id, 1)).rejects.toThrow(/no stock level/)
  })

  it('release() is idempotent-safe on an empty list', async () => {
    expect(await provider.release([])).toEqual([])
  })
})
