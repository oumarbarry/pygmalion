import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { pygId } from '../id'
import { staffApiKey, staffUser } from '../schema/staff'
import { createProductsService } from './products'
import { createSalesChannelsService } from './sales-channels'
import { createStoresService } from './stores'

let db: PygmalionDatabase
let salesChannels: ReturnType<typeof createSalesChannelsService>
let products: ReturnType<typeof createProductsService>
let stores: ReturnType<typeof createStoresService>

beforeEach(async () => {
  db = await createTestDb(schema)
  salesChannels = createSalesChannelsService({ db })
  products = createProductsService({ db })
  stores = createStoresService({ db })
})

// A staff-owned api key row, seeded directly (bypasses the better-auth plugin
// whose machinery is exercised end-to-end in the playground E2E
// suite; this unit test only cares about the sales-channel scoping join).
async function seedApiKey(prefix: string) {
  const [user] = await db
    .insert(staffUser)
    .values({ id: pygId('staff'), name: 'Test Staff', email: `${pygId('e')}@test.pygmalion.dev` })
    .returning()
  const [key] = await db
    .insert(staffApiKey)
    .values({ id: pygId('key'), referenceId: user.id, prefix, key: pygId('hashed') })
    .returning()
  return key
}

describe('sales channels service', () => {
  it('create returns a prefixed id and sane defaults', async () => {
    const c = await salesChannels.create({ name: 'Web' })
    expect(c.id).toMatch(/^sc_/)
    expect(c.isDisabled).toBe(false)
  })

  it('create rejects a blank name (zod)', async () => {
    await expect(salesChannels.create({ name: '' })).rejects.toThrow()
  })

  it('update / get / list / soft-delete round-trip', async () => {
    const c = await salesChannels.create({ name: 'POS' })
    const updated = await salesChannels.update(c.id, { isDisabled: true })
    expect(updated?.isDisabled).toBe(true)
    expect((await salesChannels.get(c.id))?.isDisabled).toBe(true)
    expect((await salesChannels.list({ q: 'pos' })).some((row) => row.id === c.id)).toBe(true)

    const removed = await salesChannels.remove(c.id)
    expect(removed?.id).toBe(c.id)
    expect(await salesChannels.get(c.id)).toBeNull()
  })

  it('remove is blocked while the channel is the store default', async () => {
    await stores.ensure()
    const c = await salesChannels.ensureDefaultChannel()
    await expect(salesChannels.remove(c!.id)).rejects.toThrow(/store default/)
  })

  it('add/remove products from a channel', async () => {
    const c = await salesChannels.create({ name: 'Web' })
    const p1 = await products.create({ title: 'A' })
    const p2 = await products.create({ title: 'B' })

    await salesChannels.updateProducts(c.id, { add: [p1.id, p2.id] })
    expect((await salesChannels.listProductIds(c.id)).sort()).toEqual([p1.id, p2.id].sort())

    await salesChannels.updateProducts(c.id, { remove: [p1.id] })
    expect(await salesChannels.listProductIds(c.id)).toEqual([p2.id])
  })

  it('a product outside the channel is invisible when the product list is scoped to it', async () => {
    const channelA = await salesChannels.create({ name: 'Channel A' })
    const channelB = await salesChannels.create({ name: 'Channel B' })
    const inChannel = await products.create({ title: 'In A' })
    const outOfChannel = await products.create({ title: 'In B only' })
    await salesChannels.updateProducts(channelA.id, { add: [inChannel.id] })
    await salesChannels.updateProducts(channelB.id, { add: [outOfChannel.id] })

    const scoped = await products.list({ channelIds: [channelA.id] })
    expect(scoped.map((p) => p.id)).toEqual([inChannel.id])
  })

  it('scopes a publishable key to channels and resolves them back', async () => {
    const key = await seedApiKey('pk_')
    const c1 = await salesChannels.create({ name: 'Web' })
    const c2 = await salesChannels.create({ name: 'POS' })

    await salesChannels.updateKeyChannels(key.id, { add: [c1.id, c2.id] })
    expect((await salesChannels.listChannelIdsForKey(key.id)).sort()).toEqual([c1.id, c2.id].sort())

    await salesChannels.updateKeyChannels(key.id, { remove: [c1.id] })
    expect(await salesChannels.listChannelIdsForKey(key.id)).toEqual([c2.id])
  })

  it('ensureDefaultChannel creates and pins a default once, idempotently', async () => {
    await stores.ensure()
    const first = await salesChannels.ensureDefaultChannel()
    const second = await salesChannels.ensureDefaultChannel()
    expect(second?.id).toBe(first?.id)
    expect((await salesChannels.getDefaultChannel())?.id).toBe(first?.id)
  })
})
