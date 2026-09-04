import { emitDomainEvent, type PaymentProvider, type PygmalionDatabase } from '@oumarbarry/pygmalion-core'

/**
 * Handle a verified Stripe webhook the async way: the
 * provider verifies the signature and normalizes the event, then we ONLY
 * enqueue it to the outbox and return — never mutate payment state
 * synchronously in the HTTP handler. A Nitro drain processes `payment.webhook`
 * afterwards, absorbing the race between "webhook arrives" and "authorize call
 * still in flight". Throws (bad signature) propagate so the route replies 400.
 */
export async function enqueueStripeWebhook(
  db: PygmalionDatabase,
  provider: PaymentProvider,
  rawBody: string | Buffer,
  signature: string | undefined,
): Promise<{ received: true; enqueued: boolean }> {
  if (!provider.handleWebhook) throw new Error('stripe: provider does not handle webhooks')
  const action = await provider.handleWebhook(rawBody, signature)
  // An intent not created by Pygmalion (no session_id) is ignored, not enqueued.
  if (action.action === 'not_supported') return { received: true, enqueued: false }
  await emitDomainEvent(db, 'payment.webhook', { provider: 'stripe', ...action })
  return { received: true, enqueued: true }
}
