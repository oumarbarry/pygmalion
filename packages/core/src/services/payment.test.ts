import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createManualPaymentProvider, createPaymentService, type PaymentProvider, type PaymentProviderRegistry } from './payment'

let db: PygmalionDatabase
let payment: ReturnType<typeof createPaymentService>

function registryOf(provider: PaymentProvider): PaymentProviderRegistry {
  return { get: () => provider }
}

beforeEach(async () => {
  db = await createTestDb(schema)
  payment = createPaymentService({ db, providers: registryOf(createManualPaymentProvider()) })
})

describe('manual payment provider', () => {
  it('initiates pending, authorizes without any external call', async () => {
    const provider = createManualPaymentProvider()
    const init = await provider.initiate({ amount: 1000, currencyCode: 'usd' })
    expect(init.status).toBe('pending')
    const auth = await provider.authorize(init.data)
    expect(auth.status).toBe('authorized')
  })
})

describe('payment collections + sessions', () => {
  it('creates a collection on a cart and a provider session (status awaiting)', async () => {
    const collection = await payment.collections.create({ cartId: null, amount: 2000, currencyCode: 'usd' })
    expect(collection.id).toMatch(/^payc_/)
    expect(collection.status).toBe('not_paid')

    const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    expect(session.id).toMatch(/^payses_/)
    expect(session.status).toBe('pending')
    expect(session.amount).toBe(2000)

    const got = await payment.collections.get(collection.id)
    expect(got?.status).toBe('awaiting')
    expect(got?.sessions).toHaveLength(1)
  })
})

describe('derived amounts (SQL aggregate, no mutable counter)', () => {
  it('authorized/captured/refunded are computed from payment/capture/refund rows', async () => {
    const collection = await payment.collections.create({ cartId: null, amount: 5000, currencyCode: 'usd' })
    const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    const pay = await payment.recordAuthorization({ sessionId: session.id, amount: 5000 })
    expect(pay.id).toMatch(/^pay_/)

    let got = await payment.collections.get(collection.id)
    expect(got?.authorizedAmount).toBe(5000)
    expect(got?.capturedAmount).toBe(0)
    expect(got?.refundedAmount).toBe(0)

    // Partial capture then partial refund — amounts stay SQL-derived.
    await payment.capture({ paymentId: pay.id, amount: 3000 })
    await payment.refund({ paymentId: pay.id, amount: 1000 })
    got = await payment.collections.get(collection.id)
    expect(got?.capturedAmount).toBe(3000)
    expect(got?.refundedAmount).toBe(1000)
  })

  it('captures and refunds are append-only (two captures accumulate)', async () => {
    const collection = await payment.collections.create({ cartId: null, amount: 5000, currencyCode: 'usd' })
    const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    const pay = await payment.recordAuthorization({ sessionId: session.id, amount: 5000 })
    await payment.capture({ paymentId: pay.id, amount: 2000 })
    await payment.capture({ paymentId: pay.id, amount: 1500 })
    const got = await payment.collections.get(collection.id)
    expect(got?.capturedAmount).toBe(3500)
  })

  it('rejects a refund that exceeds the captured amount', async () => {
    const collection = await payment.collections.create({ cartId: null, amount: 5000, currencyCode: 'usd' })
    const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    const pay = await payment.recordAuthorization({ sessionId: session.id, amount: 5000 })
    await payment.capture({ paymentId: pay.id, amount: 1000 })
    await expect(payment.refund({ paymentId: pay.id, amount: 2000 })).rejects.toThrow()
  })
})

// `refunds.refund_reason_id` had a table and a FK but no service and no
// route, a dead FK. CRUD referential, mirror of return reasons.
describe('refund reasons', () => {
  it('creates, lists, updates and soft-deletes a reason', async () => {
    const reason = await payment.reasons.create({ code: 'damaged', label: 'Damaged on arrival' })
    expect(reason.id).toMatch(/^refr_/)
    expect(await payment.reasons.list()).toHaveLength(1)

    const updated = await payment.reasons.update(reason.id, { label: 'Damaged' })
    expect(updated?.label).toBe('Damaged')

    expect(await payment.reasons.remove(reason.id)).toMatchObject({ id: reason.id })
    expect(await payment.reasons.list()).toHaveLength(0)
    expect(await payment.reasons.get(reason.id)).toBeNull()
  })

  it('is attachable to a refund (the FK it exists for)', async () => {
    const reason = await payment.reasons.create({ code: 'goodwill', label: 'Goodwill' })
    const collection = await payment.collections.create({ cartId: null, amount: 1000, currencyCode: 'usd' })
    const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    const pay = await payment.recordAuthorization({ sessionId: session.id, amount: 1000 })
    await payment.capture({ paymentId: pay.id, amount: 1000 })
    await payment.refund({ paymentId: pay.id, amount: 200, refundReasonId: reason.id })
    const detail = await payment.payments.get(pay.id)
    expect(detail?.refunds[0].refundReasonId).toBe(reason.id)
  })
})

describe('financial guards (security)', () => {
  async function seedAuthorized(amount: number) {
    const collection = await payment.collections.create({ cartId: null, amount, currencyCode: 'usd' })
    const session = await payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
    const pay = await payment.recordAuthorization({ sessionId: session.id, amount })
    return { collection, pay }
  }

  it('rejects non-positive / non-integer amounts on capture and refund', async () => {
    const { pay } = await seedAuthorized(5000)
    await payment.capture({ paymentId: pay.id, amount: 5000 })
    for (const bad of [0, -100, 10.5]) {
      await expect(payment.capture({ paymentId: pay.id, amount: bad })).rejects.toThrow()
      await expect(payment.refund({ paymentId: pay.id, amount: bad })).rejects.toThrow()
    }
  })

  it('rejects a capture that exceeds the authorized payment amount', async () => {
    const { pay } = await seedAuthorized(5000)
    await payment.capture({ paymentId: pay.id, amount: 3000 })
    await expect(payment.capture({ paymentId: pay.id, amount: 3000 })).rejects.toThrow()
  })

  it('rejects capturing a canceled payment', async () => {
    const { pay } = await seedAuthorized(5000)
    await payment.cancel(pay.id)
    await expect(payment.capture({ paymentId: pay.id, amount: 1000 })).rejects.toThrow()
  })
})
