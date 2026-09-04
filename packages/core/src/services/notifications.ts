import { and, asc, eq } from 'drizzle-orm'
import { pygId } from '../id'
import { notifications, type Notification } from '../schema/notifications'
import { orders } from '../schema/orders'
import { staffInvite } from '../schema/staff'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

// Notifications (provider seam).
//
// Same split as webhooks: `enqueueEventNotifications` runs inside the outbox
// drain tx and only writes rows; `flushNotifications` runs after that commit and
// is the only place a provider (email/SMS/…) is called.

export type NotificationChannel = 'email' | 'feed'

export interface NewNotification {
  to: string
  channel: NotificationChannel
  template: string
  data: Record<string, unknown>
}

/**
 * Notification provider seam. `send` MUST be safe to call outside a
 * transaction and is expected to throw on transport failure; the flush records
 * the error on the row and moves on.
 *
 * Register one from a Nuxt module:
 *
 * ```ts
 * // modules/resend/index.ts
 * nuxt.hook('pygmalion:providers', (registry) => registry.add('my-module/runtime/providers'))
 * // runtime/providers.ts
 * export default [{ type: 'notification', id: 'resend', factory: () => createResendProvider() }]
 * ```
 *
 * then point the runtime at it: `pygmalion: { notificationProvider: 'resend' }`
 * in `nuxt.config.ts`. The default is the DB-backed `local` provider below.
 */
export interface NotificationProvider {
  send(notification: Notification): Promise<void>
}

/**
 * Default provider. Deliberately no transport at all: the `notifications` row IS
 * the delivery (admin feed / dev inspection). A real email or SMS module
 * registers its own provider under a different id (see the JSDoc above).
 */
export function createLocalNotificationProvider(): NotificationProvider {
  return { async send() {} }
}

// --- Subscriptions ------------------------------------------------------------
// One entry per event the framework notifies on. A resolver reads whatever the
// event payload references (order email, invite email) and returns the rows to
// queue — returning none is normal (guest order with no email, deleted row).

type Resolver = (db: PygmalionDatabase, payload: Record<string, unknown>) => Promise<NewNotification[]>

async function orderEmail(db: PygmalionDatabase, orderId: unknown): Promise<string | null> {
  if (typeof orderId !== 'string') return null
  const [order] = await db.select({ email: orders.email }).from(orders).where(eq(orders.id, orderId)).limit(1)
  return order?.email ?? null
}

function buyerEmail(template: string): Resolver {
  return async (db, payload) => {
    const to = await orderEmail(db, payload.orderId)
    return to ? [{ to, channel: 'email', template, data: payload }] : []
  }
}

const SUBSCRIPTIONS: Record<string, Resolver> = {
  'order.placed': buyerEmail('order.placed'),
  'order.shipment_created': buyerEmail('order.shipment_created'),
  'order.return_received': buyerEmail('order.return_received'),
  'staff-invite.created': async (db, payload) => {
    if (typeof payload.id !== 'string') return []
    const [invite] = await db
      .select({ email: staffInvite.email, role: staffInvite.role })
      .from(staffInvite)
      .where(eq(staffInvite.id, payload.id))
      .limit(1)
    if (!invite) return []
    return [{
      to: invite.email,
      channel: 'email',
      template: 'staff-invite.created',
      data: { ...payload, role: invite.role },
    }]
  },
}

/** Queue the notifications a domain event triggers. DB-only, no external call. */
export async function enqueueEventNotifications(
  db: PygmalionDatabase,
  event: string,
  payload: unknown,
): Promise<number> {
  const resolve = SUBSCRIPTIONS[event]
  if (!resolve) return 0
  const rows = await resolve(db, (payload ?? {}) as Record<string, unknown>)
  if (rows.length === 0) return 0
  await db.insert(notifications).values(rows.map((n) => ({ id: pygId('noti'), ...n })))
  return rows.length
}

export interface FlushNotificationsResult {
  sent: number
  failed: number
}

/**
 * Hand every pending notification to `provider`, OUT of any transaction.
 * Each row is claimed by a conditional UPDATE on `status='pending'` before the
 * provider call, so concurrent flushes never send the same one twice.
 */
export async function flushNotifications(
  db: PygmalionDatabase,
  provider: NotificationProvider,
  opts: { limit?: number } = {},
): Promise<FlushNotificationsResult> {
  const pending = await db
    .select()
    .from(notifications)
    .where(eq(notifications.status, 'pending'))
    .orderBy(asc(notifications.createdAt))
    .limit(opts.limit ?? 50)

  let sent = 0
  let failed = 0
  for (const row of pending) {
    const [claimed] = await db
      .update(notifications)
      .set({ status: 'sending' })
      .where(and(eq(notifications.id, row.id), eq(notifications.status, 'pending')))
      .returning()
    if (!claimed) continue // another flush owns it

    try {
      await provider.send(claimed)
      await db
        .update(notifications)
        .set({ status: 'sent', sentAt: new Date(), error: null })
        .where(eq(notifications.id, row.id))
      sent++
    } catch (err) {
      await db
        .update(notifications)
        .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
        .where(eq(notifications.id, row.id))
      failed++
    }
  }
  return { sent, failed }
}

export interface ListNotificationsOptions {
  to?: string
  limit?: number
  offset?: number
}

export function createNotificationsService(ctx: ServiceContext) {
  const { db } = ctx
  return {
    async list(opts: ListNotificationsOptions = {}): Promise<Notification[]> {
      return db
        .select()
        .from(notifications)
        .where(opts.to ? eq(notifications.to, opts.to) : undefined)
        .orderBy(asc(notifications.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0)
    },
  }
}

export type NotificationsService = ReturnType<typeof createNotificationsService>
