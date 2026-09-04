import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createWebhooksService, deliverDueWebhooks, enqueueWebhookDeliveries } from './webhooks'

let db: PygmalionDatabase
let webhooks: ReturnType<typeof createWebhooksService>

beforeEach(async () => {
  db = await createTestDb(schema)
  webhooks = createWebhooksService({ db })
})

/** Records every request a fake transport receives, replying per `reply`. */
function fakeFetch(reply: (n: number) => { ok: boolean, status?: number, body?: string }) {
  const calls: { url: string, body: string, signature: string }[] = []
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({
      url: String(url),
      body: String(init?.body ?? ''),
      signature: headers.get('pygmalion-signature') ?? '',
    })
    const r = reply(calls.length)
    if (!r.ok && r.status === undefined) throw new Error(r.body ?? 'network down')
    return new Response(r.body ?? '', { status: r.status ?? (r.ok ? 200 : 500) })
  }
  return { calls, fn: fn as unknown as typeof globalThis.fetch }
}

describe('webhook endpoints CRUD', () => {
  it('create returns a whe_ id and the secret exactly once', async () => {
    const endpoint = await webhooks.endpoints.create({ url: 'https://example.test/hook', events: ['order.placed'] })
    expect(endpoint.id).toMatch(/^whe_/)
    expect(endpoint.secret).toMatch(/^whsec_/)
    expect(endpoint.active).toBe(true)

    const listed = await webhooks.endpoints.list()
    expect(listed).toHaveLength(1)
    expect('secret' in listed[0]).toBe(false)
    expect(await webhooks.endpoints.get(endpoint.id)).not.toHaveProperty('secret')
  })

  it('rotateSecret replaces the secret and returns the new one once', async () => {
    const endpoint = await webhooks.endpoints.create({ url: 'https://example.test/hook', events: ['*'] })
    const rotated = await webhooks.endpoints.rotateSecret(endpoint.id)
    expect(rotated?.secret).toMatch(/^whsec_/)
    expect(rotated?.secret).not.toBe(endpoint.secret)
    expect(await webhooks.endpoints.get(endpoint.id)).not.toHaveProperty('secret')
  })

  it('update / soft-delete round-trip', async () => {
    const endpoint = await webhooks.endpoints.create({ url: 'https://example.test/hook', events: ['*'] })
    const updated = await webhooks.endpoints.update(endpoint.id, { active: false, events: ['order.placed'] })
    expect(updated?.active).toBe(false)
    expect(updated?.events).toEqual(['order.placed'])

    expect((await webhooks.endpoints.remove(endpoint.id))?.id).toBe(endpoint.id)
    expect(await webhooks.endpoints.get(endpoint.id)).toBeNull()
    expect(await webhooks.endpoints.list()).toHaveLength(0)
  })

  it('rejects a non-http url and an empty event list (zod)', async () => {
    await expect(webhooks.endpoints.create({ url: 'ftp://nope', events: ['*'] })).rejects.toThrow()
    await expect(webhooks.endpoints.create({ url: 'https://example.test/h', events: [] })).rejects.toThrow()
  })
})

describe('webhook fan-out (enqueue, in the outbox drain tx — no HTTP)', () => {
  it('creates one pending delivery per active subscribed endpoint', async () => {
    const subscribed = await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['order.placed'] })
    const wildcard = await webhooks.endpoints.create({ url: 'https://b.test/h', events: ['*'] })
    await webhooks.endpoints.create({ url: 'https://c.test/h', events: ['order.canceled'] })
    const inactive = await webhooks.endpoints.create({ url: 'https://d.test/h', events: ['*'] })
    await webhooks.endpoints.update(inactive.id, { active: false })
    const deleted = await webhooks.endpoints.create({ url: 'https://e.test/h', events: ['*'] })
    await webhooks.endpoints.remove(deleted.id)

    const created = await enqueueWebhookDeliveries(db, 'order.placed', { orderId: 'ord_1' })
    expect(created).toBe(2)

    const deliveries = await webhooks.deliveries.list()
    expect(deliveries.map((d) => d.endpointId).sort()).toEqual([subscribed.id, wildcard.id].sort())
    expect(deliveries[0].status).toBe('pending')
    expect(deliveries[0].attempts).toBe(0)
    expect(deliveries[0].eventType).toBe('order.placed')
    expect(deliveries[0].payload).toEqual({ orderId: 'ord_1' })
  })

  it('creates nothing when no endpoint subscribes', async () => {
    await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['order.canceled'] })
    expect(await enqueueWebhookDeliveries(db, 'order.placed', {})).toBe(0)
  })
})

describe('webhook delivery worker', () => {
  it('POSTs the event envelope with an HMAC-SHA256 signature and marks it delivered', async () => {
    const endpoint = await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', { orderId: 'ord_1' })

    const transport = fakeFetch(() => ({ ok: true }))
    const now = new Date(Date.now() + 60_000)
    const result = await deliverDueWebhooks(db, { fetch: transport.fn, now })

    expect(result).toEqual({ delivered: 1, failed: 0 })
    expect(transport.calls).toHaveLength(1)
    const call = transport.calls[0]
    expect(call.url).toBe('https://a.test/h')
    expect(JSON.parse(call.body)).toMatchObject({ event: 'order.placed', data: { orderId: 'ord_1' } })

    // Stripe-shaped: `t=<unix seconds>,v1=<hex>` over `${t}.${rawBody}`.
    const [tPart, vPart] = call.signature.split(',')
    expect(tPart).toBe(`t=${Math.floor(now.getTime() / 1000)}`)
    const expected = createHmac('sha256', endpoint.secret).update(`${tPart.slice(2)}.${call.body}`).digest('hex')
    expect(vPart).toBe(`v1=${expected}`)

    const [delivery] = await webhooks.deliveries.list()
    expect(delivery.status).toBe('delivered')
    expect(delivery.attempts).toBe(1)
    expect(delivery.deliveredAt).toBeInstanceOf(Date)
    expect(delivery.lastError).toBeNull()
  })

  it('retries on failure with a 5x backoff and gives up as failed on the 3rd attempt', async () => {
    await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', {})

    const transport = fakeFetch(() => ({ ok: false, status: 500 }))
    const t0 = new Date(Date.now() + 60_000)
    expect(await deliverDueWebhooks(db, { fetch: transport.fn, now: t0, retryBaseMs: 5000, timeoutMs: 0 })).toEqual({ delivered: 0, failed: 1 })

    let [delivery] = await webhooks.deliveries.list()
    expect(delivery.status).toBe('pending')
    expect(delivery.attempts).toBe(1)
    expect(delivery.lastError).toContain('500')
    expect(delivery.nextAttemptAt.getTime()).toBe(t0.getTime() + 5000)

    // Not due yet: a tick before nextAttemptAt must not re-send.
    await deliverDueWebhooks(db, { fetch: transport.fn, now: new Date(t0.getTime() + 4999), retryBaseMs: 5000, timeoutMs: 0 })
    expect(transport.calls).toHaveLength(1)

    await deliverDueWebhooks(db, { fetch: transport.fn, now: new Date(t0.getTime() + 5000), retryBaseMs: 5000, timeoutMs: 0 })
    ;[delivery] = await webhooks.deliveries.list()
    expect(transport.calls).toHaveLength(2)
    expect(delivery.status).toBe('pending')
    expect(delivery.nextAttemptAt.getTime()).toBe(t0.getTime() + 5000 + 25_000)

    await deliverDueWebhooks(db, { fetch: transport.fn, now: new Date(t0.getTime() + 31_000), retryBaseMs: 5000, timeoutMs: 0 })
    ;[delivery] = await webhooks.deliveries.list()
    expect(transport.calls).toHaveLength(3)
    expect(delivery.status).toBe('failed')
    expect(delivery.attempts).toBe(3)

    // Exhausted: never picked up again.
    await deliverDueWebhooks(db, { fetch: transport.fn, now: new Date(t0.getTime() + 600_000), retryBaseMs: 5000, timeoutMs: 0 })
    expect(transport.calls).toHaveLength(3)
  })

  it('records a transport error (no HTTP status) as a failed attempt', async () => {
    await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', {})
    const transport = fakeFetch(() => ({ ok: false, body: 'ECONNREFUSED' }))
    await deliverDueWebhooks(db, { fetch: transport.fn })
    const [delivery] = await webhooks.deliveries.list()
    expect(delivery.status).toBe('pending')
    expect(delivery.lastError).toContain('ECONNREFUSED')
  })

  it('claims conditionally: two concurrent workers deliver a pending row exactly once', async () => {
    await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', {})

    const calls: string[] = []
    // Both workers select the row before either claims it — only the CAS
    // winner may send.
    const slowFetch = (async (url: string | URL | Request) => {
      calls.push(String(url))
      await new Promise((r) => setTimeout(r, 20))
      return new Response('', { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const [a, b] = await Promise.all([
      deliverDueWebhooks(db, { fetch: slowFetch }),
      deliverDueWebhooks(db, { fetch: slowFetch }),
    ])
    expect(calls).toHaveLength(1)
    expect(a.delivered + b.delivered).toBe(1)
    const [delivery] = await webhooks.deliveries.list()
    expect(delivery.attempts).toBe(1)
    expect(delivery.status).toBe('delivered')
  })

  it('ignores deliveries whose endpoint was deactivated or deleted', async () => {
    const endpoint = await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', {})
    await webhooks.endpoints.remove(endpoint.id)
    const transport = fakeFetch(() => ({ ok: true }))
    expect(await deliverDueWebhooks(db, { fetch: transport.fn })).toEqual({ delivered: 0, failed: 0 })
    expect(transport.calls).toHaveLength(0)
  })
})

describe('webhook deliveries history', () => {
  it('redeliver appends a new pending delivery and leaves the original untouched', async () => {
    const endpoint = await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', { orderId: 'ord_1' })
    const transport = fakeFetch(() => ({ ok: true }))
    await deliverDueWebhooks(db, { fetch: transport.fn })
    const [original] = await webhooks.deliveries.list()

    const copy = await webhooks.deliveries.redeliver(original.id)
    expect(copy?.id).not.toBe(original.id)
    expect(copy?.status).toBe('pending')
    expect(copy?.attempts).toBe(0)
    expect(copy?.payload).toEqual({ orderId: 'ord_1' })

    const all = await webhooks.deliveries.list()
    expect(all).toHaveLength(2)
    expect(all.find((d) => d.id === original.id)?.status).toBe('delivered')

    await deliverDueWebhooks(db, { fetch: transport.fn })
    expect(transport.calls).toHaveLength(2)
    expect((await webhooks.deliveries.list({ endpointId: endpoint.id }))).toHaveLength(2)
  })

  it('filters deliveries by endpoint', async () => {
    const a = await webhooks.endpoints.create({ url: 'https://a.test/h', events: ['*'] })
    await webhooks.endpoints.create({ url: 'https://b.test/h', events: ['*'] })
    await enqueueWebhookDeliveries(db, 'order.placed', {})
    expect(await webhooks.deliveries.list({ endpointId: a.id })).toHaveLength(1)
    expect(await webhooks.deliveries.list()).toHaveLength(2)
  })
})
