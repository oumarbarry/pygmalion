import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface WebhookEndpoint { id: string, url: string, events: string[], active: boolean, secret?: string }
interface WebhookDelivery { id: string, endpointId: string, eventType: string, status: string, attempts: number, lastError: string | null }
interface Notification { id: string, to: string, channel: string, template: string, status: string }
interface Received { path: string, body: string, signature: string, event: string }

// A real HTTP subscriber. `failuresByPath` makes a path 500 its first N hits so
// the retry ladder can be observed end to end.
const received: Received[] = []
const failuresLeft = new Map<string, number>()
let server: Server
let baseUrl: string

async function startReceiver(): Promise<void> {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const path = req.url ?? '/'
      received.push({
        path,
        body: Buffer.concat(chunks).toString('utf8'),
        signature: String(req.headers['pygmalion-signature'] ?? ''),
        event: String(req.headers['pygmalion-event'] ?? ''),
      })
      const left = failuresLeft.get(path) ?? 0
      if (left > 0) {
        failuresLeft.set(path, left - 1)
        res.writeHead(500).end('nope')
        return
      }
      res.writeHead(200).end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** Independent re-implementation of the verification a subscriber would write. */
function verifySignature(secret: string, header: string, body: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const expected = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex')
  const got = Buffer.from(parts.v1 ?? '', 'hex')
  const want = Buffer.from(expected, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hit = await probe()
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out waiting for ${label}`)
}

// Outgoing webhooks + notifications end to end: a real HTTP subscriber
// receives the delivery the outbox drain fanned out, verifies the HMAC
// signature with the secret returned at creation, survives a flapping endpoint
// (2 failures then success = delivered on attempt 3), and gets a redelivery on
// demand. Notifications are queued on staff invite.
describe('webhooks + notifications (e2e)', async () => {
  await startReceiver()
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        // retryBase 100ms -> attempt 2 at +100ms, attempt 3 at +500ms, so the
        // whole 3-attempt ladder fits in a test instead of 30s.
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200, webhookRetryBaseMs: 100, webhookTimeoutMs: 500 },
      },
    },
  })

  afterAll(() => { server?.close() })

  let staffCookie: string
  let secret: string
  let endpointId: string

  it('creates an endpoint, returning the signing secret exactly once', async () => {
    ;({ cookie: staffCookie } = await seedOwnerSession('webhooks-owner@test.pygmalion.dev'))
    const created = await $fetch<{ webhookEndpoint: WebhookEndpoint }>('/api/admin/webhook-endpoints', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { url: `${baseUrl}/happy`, events: ['product.created'] },
    })
    endpointId = created.webhookEndpoint.id
    secret = created.webhookEndpoint.secret!
    expect(secret).toMatch(/^whsec_/)

    // Masked everywhere else.
    const listed = await $fetch<{ webhookEndpoints: WebhookEndpoint[] }>('/api/admin/webhook-endpoints', {
      headers: { cookie: staffCookie },
    })
    expect(listed.webhookEndpoints.every((e) => e.secret === undefined)).toBe(true)
    const one = await $fetch<{ webhookEndpoint: WebhookEndpoint }>(`/api/admin/webhook-endpoints/${endpointId}`, {
      headers: { cookie: staffCookie },
    })
    expect(one.webhookEndpoint.secret).toBeUndefined()
  })

  it('delivers a domain event to the subscriber with a verifiable HMAC signature', async () => {
    const product = await $fetch<{ product: { id: string } }>('/api/admin/products', {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Webhook Mug' },
    })

    // Match on THIS product's id: events emitted before the endpoint existed
    // (fixture products) can still fan out at the next drain tick and reach
    // /happy first — the first hit is not necessarily ours.
    const hit = await waitFor('the happy-path delivery', async () =>
      received.find((r) => r.path === '/happy' && r.body.includes(product.product.id)) ?? null)

    expect(hit.event).toBe('product.created')
    expect(verifySignature(secret, hit.signature, hit.body)).toBe(true)
    expect(verifySignature('whsec_wrong', hit.signature, hit.body)).toBe(false)
    expect(JSON.parse(hit.body)).toMatchObject({ event: 'product.created', data: { id: product.product.id } })

    const delivered = await waitFor('the delivery row to settle', async () => {
      const { webhookDeliveries } = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>(
        `/api/admin/webhook-deliveries?endpointId=${endpointId}`, { headers: { cookie: staffCookie } },
      )
      return webhookDeliveries.find((d) => d.status === 'delivered' && (d.payload as { id?: string })?.id === product.product.id) ?? null
    })
    expect(delivered.attempts).toBe(1)
    expect(delivered.eventType).toBe('product.created')
  })

  it('retries a flapping endpoint and succeeds on the 3rd attempt', async () => {
    failuresLeft.set('/flaky', 2)
    const { webhookEndpoint } = await $fetch<{ webhookEndpoint: WebhookEndpoint }>('/api/admin/webhook-endpoints', {
      method: 'POST',
      headers: { cookie: staffCookie },
      body: { url: `${baseUrl}/flaky`, events: ['product.created'] },
    })
    await $fetch('/api/admin/products', {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Flaky Mug' },
    })

    const settled = await waitFor('the flaky delivery to settle', async () => {
      const { webhookDeliveries } = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>(
        `/api/admin/webhook-deliveries?endpointId=${webhookEndpoint.id}`, { headers: { cookie: staffCookie } },
      )
      return webhookDeliveries.find((d) => d.status !== 'pending') ?? null
    })
    expect(settled.status).toBe('delivered')
    expect(settled.attempts).toBe(3)
    expect(received.filter((r) => r.path === '/flaky')).toHaveLength(3)
  })

  it('redelivers on demand, appending a new attempt row', async () => {
    const { webhookDeliveries } = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>(
      `/api/admin/webhook-deliveries?endpointId=${endpointId}`, { headers: { cookie: staffCookie } },
    )
    const before = received.filter((r) => r.path === '/happy').length
    const copy = await $fetch<{ webhookDelivery: WebhookDelivery }>(
      `/api/admin/webhook-deliveries/${webhookDeliveries[0].id}/redeliver`,
      { method: 'POST', headers: { cookie: staffCookie } },
    )
    expect(copy.webhookDelivery.id).not.toBe(webhookDeliveries[0].id)
    expect(copy.webhookDelivery.status).toBe('pending')

    await waitFor('the redelivery', async () =>
      received.filter((r) => r.path === '/happy').length > before ? true : null)
    const after = await $fetch<{ webhookDeliveries: WebhookDelivery[] }>(
      `/api/admin/webhook-deliveries?endpointId=${endpointId}`, { headers: { cookie: staffCookie } },
    )
    // Append-only: the original row is still there with its own outcome.
    expect(after.webhookDeliveries.length).toBe(webhookDeliveries.length + 1)
    expect(after.webhookDeliveries.find((d) => d.id === webhookDeliveries[0].id)?.status).toBe('delivered')
  })

  it('rotate-secret invalidates the old signature', async () => {
    const rotated = await $fetch<{ webhookEndpoint: WebhookEndpoint }>(
      `/api/admin/webhook-endpoints/${endpointId}/rotate-secret`,
      { method: 'POST', headers: { cookie: staffCookie } },
    )
    expect(rotated.webhookEndpoint.secret).not.toBe(secret)
    const previous = received.find((r) => r.path === '/happy')!
    expect(verifySignature(rotated.webhookEndpoint.secret!, previous.signature, previous.body)).toBe(false)
  })

  it('stops delivering to a deleted endpoint', async () => {
    await $fetch(`/api/admin/webhook-endpoints/${endpointId}`, { method: 'DELETE', headers: { cookie: staffCookie } })
    const before = received.filter((r) => r.path === '/happy').length
    await $fetch('/api/admin/products', {
      method: 'POST', headers: { cookie: staffCookie }, body: { title: 'Post-delete Mug' },
    })
    await new Promise((r) => setTimeout(r, 1000))
    expect(received.filter((r) => r.path === '/happy')).toHaveLength(before)
  })

  it('queues a notification on staff invite and sends it through the local provider', async () => {
    const invitee = 'invited-by-webhooks@test.pygmalion.dev'
    await $fetch('/api/admin/invites', {
      method: 'POST', headers: { cookie: staffCookie }, body: { email: invitee, role: 'manager' },
    })

    const notification = await waitFor('the invite notification', async () => {
      const { notifications } = await $fetch<{ notifications: Notification[] }>(
        `/api/admin/notifications?to=${encodeURIComponent(invitee)}`, { headers: { cookie: staffCookie } },
      )
      return notifications.find((n) => n.status === 'sent') ?? null
    })
    expect(notification.template).toBe('staff-invite.created')
    expect(notification.channel).toBe('email')
  })
})
