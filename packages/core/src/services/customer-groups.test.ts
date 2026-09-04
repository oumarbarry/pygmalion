import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { customerUser } from '../schema/customers'
import type { PygmalionDatabase } from '../db/types'
import { createCustomerGroupsService } from './customer-groups'

let db: PygmalionDatabase
let groups: ReturnType<typeof createCustomerGroupsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  groups = createCustomerGroupsService({ db })
  await db.insert(customerUser).values([
    { id: 'cus_1', name: 'A', email: 'a@test.dev' },
    { id: 'cus_2', name: 'B', email: 'b@test.dev' },
  ])
})

describe('customer groups service', () => {
  it('create returns a prefixed id', async () => {
    const g = await groups.create({ name: 'VIP' })
    expect(g.id).toMatch(/^cgrp_/)
    expect(g.name).toBe('VIP')
  })

  it('list/get filter out soft-deleted groups', async () => {
    const g = await groups.create({ name: 'Wholesale' })
    await groups.remove(g.id)
    expect(await groups.get(g.id)).toBeNull()
    expect((await groups.list({})).map((r) => r.id)).not.toContain(g.id)
  })

  it('update renames a group', async () => {
    const g = await groups.create({ name: 'Old' })
    const updated = await groups.update(g.id, { name: 'New' })
    expect(updated?.name).toBe('New')
  })

  it('setMembers adds and removes members in one batch call (parity: /customer-groups/:id/customers)', async () => {
    const g = await groups.create({ name: 'VIP' })
    await groups.setMembers(g.id, { add: ['cus_1', 'cus_2'] })
    expect((await groups.members(g.id)).map((m) => m.id).sort()).toEqual(['cus_1', 'cus_2'])

    await groups.setMembers(g.id, { remove: ['cus_1'] })
    expect((await groups.members(g.id)).map((m) => m.id)).toEqual(['cus_2'])
  })

  it('adding the same member twice does not error (idempotent)', async () => {
    const g = await groups.create({ name: 'VIP' })
    await groups.setMembers(g.id, { add: ['cus_1'] })
    await groups.setMembers(g.id, { add: ['cus_1'] })
    expect(await groups.members(g.id)).toHaveLength(1)
  })

  // The customer side of the same link:
  // POST /api/admin/customers/:id/customer-groups.
  it('groupsOf / setGroupsOf manage the link from the customer side', async () => {
    const vip = await groups.create({ name: 'VIP' })
    const pro = await groups.create({ name: 'Pro' })
    await groups.setGroupsOf('cus_1', { add: [vip.id, pro.id] })
    expect((await groups.groupsOf('cus_1')).map((g) => g.id).sort()).toEqual([pro.id, vip.id].sort())

    await groups.setGroupsOf('cus_1', { remove: [vip.id] })
    expect((await groups.groupsOf('cus_1')).map((g) => g.id)).toEqual([pro.id])
    // A soft-deleted group disappears from the customer's groups.
    await groups.remove(pro.id)
    expect(await groups.groupsOf('cus_1')).toHaveLength(0)
  })
})
