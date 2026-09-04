import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import { pygId } from '../id'
import { orders } from '../schema/orders'
import { currencies, regions } from '../schema/settings'
import { staffInvite } from '../schema/staff'
import type { PygmalionDatabase } from '../db/types'
import {
  createLocalNotificationProvider,
  createNotificationsService,
  enqueueEventNotifications,
  flushNotifications,
  type NotificationProvider,
} from './notifications'

let db: PygmalionDatabase
let notifications: ReturnType<typeof createNotificationsService>

beforeEach(async () => {
  db = await createTestDb(schema)
  notifications = createNotificationsService({ db })
})

async function seedOrder(email: string | null): Promise<string> {
  await db
    .insert(currencies)
    .values({ code: 'eur', symbol: '€', symbolNative: '€', name: 'Euro', decimalDigits: 2 })
    .onConflictDoNothing()
  const [region] = await db.insert(regions).values({ id: pygId('reg'), name: 'EU', currencyCode: 'eur' }).returning()
  const [order] = await db
    .insert(orders)
    .values({ id: pygId('ord'), regionId: region.id, currencyCode: 'eur', email })
    .returning()
  return order.id
}

describe('notification subscriptions (enqueued in the outbox drain tx)', () => {
  it('queues an email to the buyer on order.placed', async () => {
    const orderId = await seedOrder('buyer@test.pygmalion.dev')
    expect(await enqueueEventNotifications(db, 'order.placed', { orderId })).toBe(1)

    const [row] = await notifications.list()
    expect(row.to).toBe('buyer@test.pygmalion.dev')
    expect(row.channel).toBe('email')
    expect(row.template).toBe('order.placed')
    expect(row.status).toBe('pending')
    expect(row.data).toMatchObject({ orderId })
  })

  it('queues on order.shipment_created and order.return_received', async () => {
    const orderId = await seedOrder('buyer@test.pygmalion.dev')
    await enqueueEventNotifications(db, 'order.shipment_created', { orderId, fulfillmentId: 'ful_1' })
    await enqueueEventNotifications(db, 'order.return_received', { orderId, returnId: 'ret_1' })

    expect((await notifications.list()).map((n) => n.template).sort()).toEqual([
      'order.return_received',
      'order.shipment_created',
    ])
  })

  it('queues the staff invite email on staff-invite.created', async () => {
    const [invite] = await db
      .insert(staffInvite)
      .values({
        id: pygId('inv'),
        email: 'newstaff@test.pygmalion.dev',
        role: 'manager',
        token: 'hashed',
        expiresAt: new Date(Date.now() + 1000),
      })
      .returning()
    expect(await enqueueEventNotifications(db, 'staff-invite.created', { id: invite.id })).toBe(1)

    const [row] = await notifications.list()
    expect(row.to).toBe('newstaff@test.pygmalion.dev')
    expect(row.template).toBe('staff-invite.created')
    expect(row.data).toMatchObject({ role: 'manager' })
  })

  it('queues nothing for an unsubscribed event or an order with no email', async () => {
    expect(await enqueueEventNotifications(db, 'cart.updated', { id: 'cart_1' })).toBe(0)
    const orderId = await seedOrder(null)
    expect(await enqueueEventNotifications(db, 'order.placed', { orderId })).toBe(0)
    expect(await notifications.list()).toHaveLength(0)
  })

  it('lists by recipient', async () => {
    const a = await seedOrder('a@test.pygmalion.dev')
    const b = await seedOrder('b@test.pygmalion.dev')
    await enqueueEventNotifications(db, 'order.placed', { orderId: a })
    await enqueueEventNotifications(db, 'order.placed', { orderId: b })
    expect(await notifications.list({ to: 'a@test.pygmalion.dev' })).toHaveLength(1)
    expect(await notifications.list()).toHaveLength(2)
  })
})

describe('notification flush (provider call, out of any tx)', () => {
  it('hands each pending row to the provider and marks it sent', async () => {
    const orderId = await seedOrder('buyer@test.pygmalion.dev')
    await enqueueEventNotifications(db, 'order.placed', { orderId })

    const seen: string[] = []
    const provider: NotificationProvider = { async send(n) { seen.push(`${n.channel}:${n.to}:${n.template}`) } }
    expect(await flushNotifications(db, provider)).toEqual({ sent: 1, failed: 0 })
    expect(seen).toEqual(['email:buyer@test.pygmalion.dev:order.placed'])

    const [row] = await notifications.list()
    expect(row.status).toBe('sent')
    expect(row.sentAt).toBeInstanceOf(Date)

    // Already sent: a second flush is a no-op.
    expect(await flushNotifications(db, provider)).toEqual({ sent: 0, failed: 0 })
    expect(seen).toHaveLength(1)
  })

  it('records a provider failure on the row instead of throwing', async () => {
    const orderId = await seedOrder('buyer@test.pygmalion.dev')
    await enqueueEventNotifications(db, 'order.placed', { orderId })
    const provider: NotificationProvider = { async send() { throw new Error('smtp unreachable') } }

    expect(await flushNotifications(db, provider)).toEqual({ sent: 0, failed: 1 })
    const [row] = await notifications.list()
    expect(row.status).toBe('failed')
    expect(row.error).toContain('smtp unreachable')
  })

  it('claims conditionally: two concurrent flushes send each row exactly once', async () => {
    const orderId = await seedOrder('buyer@test.pygmalion.dev')
    await enqueueEventNotifications(db, 'order.placed', { orderId })

    let calls = 0
    const provider: NotificationProvider = {
      async send() {
        calls++
        await new Promise((r) => setTimeout(r, 20))
      },
    }
    const [a, b] = await Promise.all([flushNotifications(db, provider), flushNotifications(db, provider)])
    expect(calls).toBe(1)
    expect(a.sent + b.sent).toBe(1)
  })

  it('the local provider needs no transport — the row is the delivery', async () => {
    const orderId = await seedOrder('buyer@test.pygmalion.dev')
    await enqueueEventNotifications(db, 'order.placed', { orderId })
    expect(await flushNotifications(db, createLocalNotificationProvider())).toEqual({ sent: 1, failed: 0 })
    expect((await notifications.list())[0].status).toBe('sent')
  })
})
