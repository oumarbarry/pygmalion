import { describe, expect, it } from 'vitest'
import type { PaymentProvider, PygmalionDatabase, WebhookAction } from '@oumarbarry/pygmalion-core'
import { enqueueStripeWebhook } from './webhook'

// Minimal db double: emitDomainEvent does `db.insert(table).values(obj)`.
function fakeDb() {
  const outbox: Array<{ event: string; payload: unknown }> = []
  const db = {
    insert: () => ({ values: async (v: { event: string; payload: unknown }) => void outbox.push(v) }),
  } as unknown as PygmalionDatabase
  return { db, outbox }
}

function providerReturning(action: WebhookAction): PaymentProvider {
  return { async handleWebhook() { return action } } as unknown as PaymentProvider
}

describe('stripe webhook — async via outbox (never synchronous)', () => {
  it('enqueues a payment.webhook outbox event, does not mutate payment state', async () => {
    const { db, outbox } = fakeDb()
    const provider = providerReturning({ action: 'captured', sessionId: 'payses_1', amount: 2500 })
    const res = await enqueueStripeWebhook(db, provider, Buffer.from('{}'), 'sig')
    expect(res).toEqual({ received: true, enqueued: true })
    expect(outbox).toHaveLength(1)
    expect(outbox[0].event).toBe('payment.webhook')
    expect(outbox[0].payload).toMatchObject({ provider: 'stripe', action: 'captured', sessionId: 'payses_1' })
  })

  it('ignores a not_supported event (no outbox row)', async () => {
    const { db, outbox } = fakeDb()
    const provider = providerReturning({ action: 'not_supported' })
    const res = await enqueueStripeWebhook(db, provider, Buffer.from('{}'), 'sig')
    expect(res.enqueued).toBe(false)
    expect(outbox).toHaveLength(0)
  })

  it('propagates a verification failure (route replies 400)', async () => {
    const { db } = fakeDb()
    const provider = { async handleWebhook() { throw new Error('Invalid signature') } } as unknown as PaymentProvider
    await expect(enqueueStripeWebhook(db, provider, Buffer.from('{}'), 'bad')).rejects.toThrow()
  })
})
