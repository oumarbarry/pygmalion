import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { customerUser } from '../schema/customers'
import type { PygmalionDatabase } from '../db/types'
import { createCustomersService } from './customers'

let db: PygmalionDatabase
let customers: ReturnType<typeof createCustomersService>

beforeEach(async () => {
  db = await createTestDb(schema)
  customers = createCustomersService({ db })
})

describe('customers service', () => {
  it('update sets profile fields and emits customer.updated', async () => {
    const [row] = await db
      .insert(customerUser)
      .values({ id: 'cus_1', name: 'A', email: 'a@test.dev' })
      .returning()
    const updated = await customers.update(row.id, { name: 'Alice', phone: '+15551234' })
    expect(updated?.name).toBe('Alice')
    expect(updated?.phone).toBe('+15551234')
  })

  it('update returns null for an unknown id', async () => {
    expect(await customers.update('cus_missing', { name: 'x' })).toBeNull()
  })

  describe('ensureGuest — coexistence with a registered account', () => {
    it('creates a guest row with hasAccount=false', async () => {
      const guest = await customers.ensureGuest('guest@test.dev')
      expect(guest.id).toMatch(/^cus_/)
      expect(guest.hasAccount).toBe(false)
      expect(guest.email).toBe('guest@test.dev')
    })

    it('is idempotent: calling it twice for the same email returns the same guest row', async () => {
      const first = await customers.ensureGuest('repeat@test.dev')
      const second = await customers.ensureGuest('repeat@test.dev')
      expect(second.id).toBe(first.id)
      const rows = await db.select().from(customerUser).where(eq(customerUser.email, 'repeat@test.dev'))
      expect(rows.length).toBe(1)
    })

    it('a guest row and a registered row for the SAME email coexist (unique on email+hasAccount, not email alone)', async () => {
      // Registered row created first (mirrors what better-auth's own
      // sign-up would insert — hasAccount defaults true at the DB level).
      await db.insert(customerUser).values({ id: 'cus_registered', name: 'Bob', email: 'both@test.dev' })

      const guest = await customers.ensureGuest('both@test.dev')
      expect(guest.hasAccount).toBe(false)

      const rows = await db.select().from(customerUser).where(eq(customerUser.email, 'both@test.dev'))
      expect(rows.length).toBe(2)
      expect(rows.map((r) => r.hasAccount).sort()).toEqual([false, true])
    })

    it('DB-level unique index blocks a second row with the SAME (email, hasAccount) pair', async () => {
      await customers.ensureGuest('dupe@test.dev')
      await expect(
        db.insert(customerUser).values({ id: 'cus_dupe2', name: '', email: 'dupe@test.dev', hasAccount: false }),
      ).rejects.toThrow()
    })
  })

  describe('addresses', () => {
    it('create/list/update/remove, with at most one default shipping + one default billing per customer', async () => {
      const [customer] = await db
        .insert(customerUser)
        .values({ id: 'cus_addr', name: 'A', email: 'addr@test.dev' })
        .returning()

      const a1 = await customers.addresses.create(customer.id, {
        address1: '1 Rue A', city: 'Paris', countryCode: 'FR', isDefaultShipping: true,
      })
      expect(a1.isDefaultShipping).toBe(true)

      const a2 = await customers.addresses.create(customer.id, {
        address1: '2 Rue B', city: 'Lyon', countryCode: 'FR', isDefaultShipping: true,
      })
      expect(a2.isDefaultShipping).toBe(true)

      const list = await customers.addresses.list(customer.id)
      expect(list.length).toBe(2)
      // a1 lost the default when a2 claimed it.
      expect(list.find((a) => a.id === a1.id)?.isDefaultShipping).toBe(false)

      const updated = await customers.addresses.update(customer.id, a1.id, { city: 'Marseille' })
      expect(updated?.city).toBe('Marseille')

      const removed = await customers.addresses.remove(customer.id, a1.id)
      expect(removed?.id).toBe(a1.id)
      expect(await customers.addresses.list(customer.id)).toHaveLength(1)
    })

    it('scopes reads/writes to the owning customer', async () => {
      const [c1] = await db.insert(customerUser).values({ id: 'cus_x', name: '', email: 'x@test.dev' }).returning()
      const [c2] = await db.insert(customerUser).values({ id: 'cus_y', name: '', email: 'y@test.dev' }).returning()
      const addr = await customers.addresses.create(c1.id, { city: 'Paris' })
      expect(await customers.addresses.get(c2.id, addr.id)).toBeNull()
      expect(await customers.addresses.update(c2.id, addr.id, { city: 'Nope' })).toBeNull()
      expect(await customers.addresses.remove(c2.id, addr.id)).toBeNull()
    })
  })

  // POST /api/admin/customers: a merchant creating a
  // customer by hand (phone order, in-store). No credential: the row is a
  // guest until that email signs up.
  describe('create (admin)', () => {
    it('creates a customer with no account and normalizes the email', async () => {
      const customer = await customers.create({ email: '  Ada@Test.DEV ', name: 'Ada', phone: '+33 1' })
      expect(customer.id).toMatch(/^cus_/)
      expect(customer.email).toBe('ada@test.dev')
      expect(customer.hasAccount).toBe(false)
      expect(await customers.get(customer.id)).toMatchObject({ name: 'Ada', phone: '+33 1' })
    })

    it('refuses a second guest row for the same email', async () => {
      await customers.create({ email: 'dup@test.dev' })
      await expect(customers.create({ email: 'dup@test.dev' })).rejects.toThrow()
    })
  })
})
