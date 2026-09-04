import { describe, expect, it } from 'vitest'
import { createStripePaymentProvider, type StripeLike } from './provider'

// Fully mocked Stripe client — NO network, ever (CI-safe). Records calls so we
// can assert the provider translates cents amounts and metadata correctly.
function mockStripe(overrides: {
  createStatus?: string
  retrieveStatus?: string
  constructEvent?: (payload: string | Buffer, sig: string, secret: string) => unknown
} = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const record = (method: string, ...args: unknown[]) => calls.push({ method, args })
  const stripe: StripeLike = {
    paymentIntents: {
      async create(params) {
        record('create', params)
        return { id: 'pi_test', client_secret: 'cs_test', status: overrides.createStatus ?? 'requires_payment_method' } as never
      },
      async retrieve(id) {
        record('retrieve', id)
        return { id, status: overrides.retrieveStatus ?? 'requires_capture' } as never
      },
      async capture(id, params) {
        record('capture', id, params)
        return { id, status: 'succeeded' } as never
      },
      async cancel(id) {
        record('cancel', id)
        return { id, status: 'canceled' } as never
      },
    },
    refunds: {
      async create(params) {
        record('refund', params)
        return { id: 're_test', status: 'succeeded' } as never
      },
    },
    webhooks: {
      constructEvent(payload, sig, secret) {
        if (overrides.constructEvent) return overrides.constructEvent(payload, sig, secret)
        if (sig !== 'good-sig') throw new Error('Invalid signature')
        return JSON.parse(payload.toString())
      },
    },
  }
  return { stripe, calls }
}

describe('stripe payment provider — intents (mocked, no network)', () => {
  it('initiate creates a manual-capture PaymentIntent stamping the session id, returns pending', async () => {
    const { stripe, calls } = mockStripe()
    const provider = createStripePaymentProvider(stripe, { webhookSecret: 'whsec' })
    const res = await provider.initiate({ amount: 2500, currencyCode: 'usd', context: { sessionId: 'payses_1' } })
    expect(res.status).toBe('pending')
    expect(res.data.id).toBe('pi_test')
    const create = calls.find((c) => c.method === 'create')!
    const params = create.args[0] as { amount: number; currency: string; capture_method: string; metadata: { session_id: string } }
    expect(params.amount).toBe(2500) // cents native
    expect(params.currency).toBe('usd')
    expect(params.capture_method).toBe('manual')
    expect(params.metadata.session_id).toBe('payses_1')
  })

  it('initiate honours capture_method=automatic when configured', async () => {
    const { stripe, calls } = mockStripe()
    const provider = createStripePaymentProvider(stripe, { captureMethod: 'automatic' })
    await provider.initiate({ amount: 100, currencyCode: 'usd', context: { sessionId: 's' } })
    const params = calls.find((c) => c.method === 'create')!.args[0] as { capture_method: string }
    expect(params.capture_method).toBe('automatic')
  })

  it('authorize verifies the intent status (requires_capture -> authorized), no new charge call', async () => {
    const { stripe } = mockStripe({ retrieveStatus: 'requires_capture' })
    const provider = createStripePaymentProvider(stripe)
    const res = await provider.authorize({ id: 'pi_test' })
    expect(res.status).toBe('authorized')
  })

  it('capture calls paymentIntents.capture with amount_to_capture in cents', async () => {
    const { stripe, calls } = mockStripe()
    const provider = createStripePaymentProvider(stripe)
    const res = await provider.capture({ id: 'pi_test' }, 1800)
    expect(res.status).toBe('captured')
    const cap = calls.find((c) => c.method === 'capture')!
    expect(cap.args[1]).toEqual({ amount_to_capture: 1800 })
  })

  it('refund calls refunds.create with payment_intent + cents amount', async () => {
    const { stripe, calls } = mockStripe()
    const provider = createStripePaymentProvider(stripe)
    await provider.refund({ id: 'pi_test' }, 500)
    const ref = calls.find((c) => c.method === 'refund')!
    expect(ref.args[0]).toEqual({ payment_intent: 'pi_test', amount: 500 })
  })

  it('cancel cancels the intent', async () => {
    const { stripe, calls } = mockStripe()
    const provider = createStripePaymentProvider(stripe)
    const res = await provider.cancel({ id: 'pi_test' })
    expect(res.status).toBe('canceled')
    expect(calls.some((c) => c.method === 'cancel')).toBe(true)
  })

  it('maps intent statuses to session statuses', async () => {
    const cases: Array<[string, string]> = [
      ['succeeded', 'captured'],
      ['requires_capture', 'authorized'],
      ['requires_action', 'requires_more'],
      ['canceled', 'canceled'],
      ['requires_confirmation', 'pending'],
      ['processing', 'pending'],
    ]
    for (const [intentStatus, expected] of cases) {
      const { stripe } = mockStripe({ retrieveStatus: intentStatus })
      const provider = createStripePaymentProvider(stripe)
      expect(await provider.getStatus({ id: 'pi_test' })).toBe(expected)
    }
  })
})

describe('stripe webhook parsing (mocked, no network)', () => {
  it('verifies the signature and maps succeeded -> captured with the session id', async () => {
    const { stripe } = mockStripe()
    const provider = createStripePaymentProvider(stripe, { webhookSecret: 'whsec' })
    const event = { type: 'payment_intent.succeeded', data: { object: { metadata: { session_id: 'payses_9' }, amount_received: 2500 } } }
    const action = await provider.handleWebhook!(Buffer.from(JSON.stringify(event)), 'good-sig')
    expect(action.action).toBe('captured')
    expect(action.sessionId).toBe('payses_9')
  })

  it('throws on a bad signature (never trusts an unverified payload)', async () => {
    const { stripe } = mockStripe()
    const provider = createStripePaymentProvider(stripe, { webhookSecret: 'whsec' })
    await expect(provider.handleWebhook!(Buffer.from('{}'), 'bad-sig')).rejects.toThrow()
  })

  it('returns not_supported for an intent with no session_id (foreign to Pygmalion)', async () => {
    const { stripe } = mockStripe()
    const provider = createStripePaymentProvider(stripe, { webhookSecret: 'whsec' })
    const event = { type: 'payment_intent.succeeded', data: { object: { metadata: {} } } }
    const action = await provider.handleWebhook!(Buffer.from(JSON.stringify(event)), 'good-sig')
    expect(action.action).toBe('not_supported')
  })
})
