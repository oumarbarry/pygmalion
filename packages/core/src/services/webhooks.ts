import { createHmac, randomBytes } from 'node:crypto'
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm'
import { pygId } from '../id'
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookDelivery,
  type WebhookEndpoint,
} from '../schema/webhooks'
import {
  createWebhookEndpointInput,
  updateWebhookEndpointInput,
  type CreateWebhookEndpointInput,
  type UpdateWebhookEndpointInput,
} from '../validation/webhooks'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

// Outgoing webhooks.
//
// Two halves, split exactly on the transaction boundary:
//   `enqueueWebhookDeliveries(tx, event, payload)` runs INSIDE the outbox drain
//   transaction (pure DB work: read subscribed endpoints, insert one pending
//   delivery each) — so a delivery exists iff the event was really consumed.
//   `deliverDueWebhooks(db)` runs AFTER that commit and is the only place an
//   HTTP call happens. Nothing here ever fetches with a tx open.

/** 3 attempts total: immediate, +retryBaseMs, +retryBaseMs*5 (5s, 25s). */
const MAX_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_MS = 5_000
// Fixed short timeout: a subscriber that needs more than 10s should answer 202
// and work async. Make it per-endpoint when someone actually asks.
const REQUEST_TIMEOUT_MS = 10_000

/** Secret without the row's clear-text secret — what every read path returns. */
export type PublicWebhookEndpoint = Omit<WebhookEndpoint, 'secret'>

function toPublic(row: WebhookEndpoint): PublicWebhookEndpoint {
  const { secret: _secret, ...rest } = row
  return rest
}

function newSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`
}

/**
 * Stripe-shaped signature header value: `t=<unix seconds>,v1=<hex>` where the
 * HMAC-SHA256 covers `${t}.${rawBody}` — the timestamp is inside the MAC, so a
 * receiver can reject replays without trusting an unsigned header.
 *
 * A subscriber verifies it against the RAW body (never a re-serialized object):
 *
 * ```ts
 * const { t, v1 } = Object.fromEntries(
 *   header.split(',').map((p) => p.split('=') as [string, string]),
 * )
 * const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest()
 * const ok = timingSafeEqual(Buffer.from(v1, 'hex'), expected)
 *   && Date.now() / 1000 - Number(t) < 300 // replay window
 * ```
 */
export function signWebhookBody(secret: string, body: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000)
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${v1}`
}

/**
 * Fan-out: one pending delivery per active endpoint subscribed to `event`.
 * Call with the drain transaction handle — it is DB-only by design.
 * Returns the number of deliveries created.
 */
export async function enqueueWebhookDeliveries(
  db: PygmalionDatabase,
  event: string,
  payload: unknown,
): Promise<number> {
  const endpoints = await db
    .select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.active, true), isNull(webhookEndpoints.deletedAt)))

  // Subscription match in JS: endpoints are a handful of rows and a
  // jsonb containment predicate buys nothing. Push it into SQL if the table
  // ever grows past a few hundred rows.
  const targets = endpoints.filter((e) => e.events.includes('*') || e.events.includes(event))
  if (targets.length === 0) return 0

  await db.insert(webhookDeliveries).values(
    targets.map((e) => ({ id: pygId('whd'), endpointId: e.id, eventType: event, payload })),
  )
  return targets.length
}

export interface DeliverWebhooksOptions {
  /** Injectable clock (tests). */
  now?: Date
  /** Max deliveries attempted per pass. */
  limit?: number
  /** Injectable transport (tests). */
  fetch?: typeof globalThis.fetch
  /** Backoff base, ms: attempt n waits `base * 5^(n-1)`. */
  retryBaseMs?: number
  /** HTTP timeout, ms — also the floor of the claim's lease (see below). */
  timeoutMs?: number
}

export interface DeliverWebhooksResult {
  delivered: number
  failed: number
}

/**
 * Deliver every due pending delivery, OUT of any transaction.
 *
 * Idempotence law (same claim discipline as money moves): each row is
 * claimed by a conditional UPDATE on `(status='pending', attempts=<observed>)`
 * BEFORE the HTTP call. Two workers racing the same row: only one UPDATE
 * matches, the loser skips. A crash after the claim leaves the row pending
 * with its backoff pushed out, so the next pass retries it — at-least-once,
 * never twice concurrently.
 */
export async function deliverDueWebhooks(
  db: PygmalionDatabase,
  opts: DeliverWebhooksOptions = {},
): Promise<DeliverWebhooksResult> {
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 50
  const send = opts.fetch ?? globalThis.fetch
  const retryBaseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS

  const due = await db
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        lte(webhookDeliveries.nextAttemptAt, now),
        // A deactivated or removed endpoint stops receiving; its history stays,
        // and rows queued meanwhile stay pending — reactivating resumes them.
        eq(webhookEndpoints.active, true),
        isNull(webhookEndpoints.deletedAt),
      ),
    )
    .orderBy(asc(webhookDeliveries.createdAt))
    .limit(limit)

  let delivered = 0
  let failed = 0
  for (const { delivery, endpoint } of due) {
    const attempts = delivery.attempts + 1
    // The pushed nextAttemptAt is also the claim's LEASE: it must outlive the
    // HTTP timeout, or a slow endpoint lets a second pass re-claim the row
    // mid-flight (CAS satisfied: still pending, attempts unchanged since) and
    // deliver twice concurrently.
    const leaseMs = Math.max(retryBaseMs * 5 ** (attempts - 1), timeoutMs)
    const [claimed] = await db
      .update(webhookDeliveries)
      .set({ attempts, nextAttemptAt: new Date(now.getTime() + leaseMs) })
      .where(
        and(
          eq(webhookDeliveries.id, delivery.id),
          eq(webhookDeliveries.status, 'pending'),
          eq(webhookDeliveries.attempts, delivery.attempts),
        ),
      )
      .returning()
    if (!claimed) continue // another worker owns this attempt

    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.eventType,
      createdAt: delivery.createdAt.toISOString(),
      data: delivery.payload,
    })

    let error: string | null = null
    let responseStatus: number | null = null
    try {
      const res = await send(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'pygmalion-signature': signWebhookBody(endpoint.secret, body, now),
          'pygmalion-event': delivery.eventType,
        },
        body,
        signal: AbortSignal.timeout(Math.max(timeoutMs, 1)),
      })
      responseStatus = res.status
      if (!res.ok) error = `HTTP ${res.status}`
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }

    if (error === null) {
      await db
        .update(webhookDeliveries)
        .set({ status: 'delivered', deliveredAt: new Date(), lastError: null, responseStatus })
        .where(eq(webhookDeliveries.id, delivery.id))
      delivered++
    } else {
      await db
        .update(webhookDeliveries)
        .set({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', lastError: error, responseStatus })
        .where(eq(webhookDeliveries.id, delivery.id))
      failed++
    }
  }
  return { delivered, failed }
}

export interface ListWebhookDeliveriesOptions {
  endpointId?: string
  limit?: number
  offset?: number
}

export function createWebhooksService(ctx: ServiceContext) {
  const { db } = ctx

  const endpoints = {
    async list(): Promise<PublicWebhookEndpoint[]> {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(isNull(webhookEndpoints.deletedAt))
        .orderBy(desc(webhookEndpoints.createdAt))
      return rows.map(toPublic)
    },
    async get(id: string): Promise<PublicWebhookEndpoint | null> {
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, id), isNull(webhookEndpoints.deletedAt)))
        .limit(1)
      return row ? toPublic(row) : null
    },
    /** Returns the clear-text secret — the ONLY read path that ever does. */
    async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpoint> {
      const data = createWebhookEndpointInput.parse(input)
      const [row] = await db
        .insert(webhookEndpoints)
        .values({
          id: pygId('whe'),
          url: data.url,
          secret: newSecret(),
          events: data.events,
          active: data.active ?? true,
          description: data.description ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()
      return row
    },
    async update(id: string, input: UpdateWebhookEndpointInput): Promise<PublicWebhookEndpoint | null> {
      const data = updateWebhookEndpointInput.parse(input)
      const [row] = await db
        .update(webhookEndpoints)
        .set({
          ...(data.url !== undefined ? { url: data.url } : {}),
          ...(data.events !== undefined ? { events: data.events } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(webhookEndpoints.id, id), isNull(webhookEndpoints.deletedAt)))
        .returning()
      return row ? toPublic(row) : null
    },
    async remove(id: string): Promise<PublicWebhookEndpoint | null> {
      const [row] = await db
        .update(webhookEndpoints)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(webhookEndpoints.id, id), isNull(webhookEndpoints.deletedAt)))
        .returning()
      return row ? toPublic(row) : null
    },
    /** New secret, returned in clear once. Old signatures stop verifying. */
    async rotateSecret(id: string): Promise<WebhookEndpoint | null> {
      const [row] = await db
        .update(webhookEndpoints)
        .set({ secret: newSecret(), updatedAt: new Date() })
        .where(and(eq(webhookEndpoints.id, id), isNull(webhookEndpoints.deletedAt)))
        .returning()
      return row ?? null
    },
  }

  const deliveries = {
    async list(opts: ListWebhookDeliveriesOptions = {}): Promise<WebhookDelivery[]> {
      return db
        .select()
        .from(webhookDeliveries)
        .where(opts.endpointId ? eq(webhookDeliveries.endpointId, opts.endpointId) : undefined)
        .orderBy(asc(webhookDeliveries.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0)
    },
    async get(id: string): Promise<WebhookDelivery | null> {
      const [row] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1)
      return row ?? null
    },
    /**
     * Append a fresh pending delivery cloned from `id`. The history is
     * append-only: the original row keeps its own outcome forever.
     */
    async redeliver(id: string): Promise<WebhookDelivery | null> {
      const original = await deliveries.get(id)
      if (!original) return null
      const [row] = await db
        .insert(webhookDeliveries)
        .values({
          id: pygId('whd'),
          endpointId: original.endpointId,
          eventType: original.eventType,
          payload: original.payload,
        })
        .returning()
      return row
    },
  }

  return { endpoints, deliveries }
}

export type WebhooksService = ReturnType<typeof createWebhooksService>
