import { defineEventHandler, getHeader, readRawBody, setResponseStatus } from 'h3'
import type { PaymentProvider } from '@oumarbarry/pygmalion-core'
import type { PygmalionContext } from '@oumarbarry/pygmalion'
import { enqueueStripeWebhook } from '../webhook'

// POST /api/pygmalion/stripe/webhook — verify signature, enqueue to outbox,
// reply 200 (async processing via drain). Never mutates payment state here.
export default defineEventHandler(async (event) => {
  const ctx = event.context.pygmalion as PygmalionContext
  const provider = ctx.providers.get<PaymentProvider>('payment', 'stripe')
  const signature = getHeader(event, 'stripe-signature')
  // Raw bytes — Stripe signature verification is over the exact payload.
  const raw = (await readRawBody(event, false)) as Buffer | undefined
  try {
    return await enqueueStripeWebhook(ctx.db, provider, raw ?? Buffer.alloc(0), signature)
  } catch {
    setResponseStatus(event, 400)
    return { error: 'invalid signature' }
  }
})
