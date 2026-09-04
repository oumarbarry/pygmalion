import type {
  InitiatePaymentInput,
  PaymentData,
  PaymentProvider,
  PaymentProviderResult,
  PaymentSessionStatusValue,
  WebhookAction,
} from '@oumarbarry/pygmalion-core'

// Stripe PaymentIntents provider. Amounts are
// Stripe's smallest currency unit = our integer cents, passed through
// natively. Zero-decimal currencies (JPY, KRW) also use the base
// unit in Stripe, and our "cents" model already stores minor units, so the
// pass-through is correct for them too — no per-currency exponent table until
// a real multi-currency store needs one.

/**
 * The slice of the Stripe SDK this provider uses. Declared structurally so the
 * unit suite injects a mock (zero network in CI) and the runtime factory
 * passes a real `new Stripe(secretKey)` — which satisfies this shape.
 */
export interface StripeLike {
  paymentIntents: {
    create(params: Record<string, unknown>): Promise<{ id: string; client_secret: string | null; status: string }>
    retrieve(id: string): Promise<{ id: string; status: string; last_payment_error?: unknown }>
    capture(id: string, params: Record<string, unknown>): Promise<{ id: string; status: string }>
    cancel(id: string): Promise<{ id: string; status: string }>
  }
  refunds: {
    create(params: Record<string, unknown>): Promise<{ id: string; status: string }>
  }
  webhooks: {
    constructEvent(payload: string | Buffer, signature: string, secret: string): unknown
  }
}

export interface StripeProviderOptions {
  /** `manual` (authorize now, capture later at shipment) is the recommended default. */
  captureMethod?: 'manual' | 'automatic'
  webhookSecret?: string
}

/** Stripe PaymentIntent.status -> Pygmalion PaymentSessionStatus. */
export function mapIntentStatus(status: string, hasError = false): PaymentSessionStatusValue {
  switch (status) {
    case 'succeeded':
      return 'captured'
    case 'requires_capture':
      return 'authorized'
    case 'requires_action':
      return 'requires_more'
    case 'canceled':
      return 'canceled'
    case 'processing':
      return 'pending'
    case 'requires_payment_method':
      return hasError ? 'error' : 'pending'
    case 'requires_confirmation':
    default:
      return 'pending'
  }
}

/** Stripe webhook event.type -> normalized action. */
function mapWebhookType(type: string): WebhookAction['action'] {
  switch (type) {
    case 'payment_intent.succeeded':
      return 'captured'
    case 'payment_intent.amount_capturable_updated':
      return 'authorized'
    case 'payment_intent.payment_failed':
      return 'failed'
    case 'payment_intent.canceled':
      return 'canceled'
    case 'payment_intent.requires_action':
      return 'requires_more'
    default:
      return 'pending'
  }
}

export function createStripePaymentProvider(stripe: StripeLike, options: StripeProviderOptions = {}): PaymentProvider {
  const captureMethod = options.captureMethod ?? 'manual'
  const intentId = (data: PaymentData): string => {
    const id = data.id
    if (typeof id !== 'string') throw new Error('stripe: session data missing PaymentIntent id')
    return id
  }

  return {
    async initiate(input: InitiatePaymentInput): Promise<PaymentProviderResult> {
      const sessionId = input.context?.sessionId
      const intent = await stripe.paymentIntents.create({
        amount: input.amount,
        currency: input.currencyCode,
        capture_method: captureMethod,
        // Correlation key — the webhook recovers the session from it.
        metadata: sessionId ? { session_id: String(sessionId) } : {},
      })
      return { data: { id: intent.id, clientSecret: intent.client_secret }, status: mapIntentStatus(intent.status) }
    },

    async authorize(data): Promise<PaymentProviderResult> {
      // The client confirmed the intent browser-side; the server only verifies.
      const intent = await stripe.paymentIntents.retrieve(intentId(data))
      return { data: { ...data, status: intent.status }, status: mapIntentStatus(intent.status, Boolean(intent.last_payment_error)) }
    },

    async capture(data, amount): Promise<PaymentProviderResult> {
      const intent = await stripe.paymentIntents.capture(intentId(data), { amount_to_capture: amount })
      return { data: { ...data, status: intent.status }, status: mapIntentStatus(intent.status) }
    },

    async refund(data, amount): Promise<PaymentProviderResult> {
      await stripe.refunds.create({ payment_intent: intentId(data), amount })
      return { data, status: 'authorized' }
    },

    async cancel(data): Promise<PaymentProviderResult> {
      const intent = await stripe.paymentIntents.cancel(intentId(data))
      return { data: { ...data, status: intent.status }, status: mapIntentStatus(intent.status) }
    },

    async getStatus(data): Promise<PaymentSessionStatusValue> {
      const intent = await stripe.paymentIntents.retrieve(intentId(data))
      return mapIntentStatus(intent.status, Boolean(intent.last_payment_error))
    },

    async handleWebhook(payload, signature): Promise<WebhookAction> {
      if (!options.webhookSecret) throw new Error('stripe: webhookSecret not configured')
      // Throws on a tampered/forged payload — never trust an unverified event.
      const event = stripe.webhooks.constructEvent(
        payload as string | Buffer,
        signature ?? '',
        options.webhookSecret,
      ) as { type: string; data: { object: { metadata?: Record<string, unknown>; amount_received?: number; amount?: number } } }
      const object = event.data?.object ?? {}
      const sessionId = object.metadata?.session_id
      // An intent generated outside Pygmalion on the same Stripe account has no
      // session_id — ignore it.
      if (!sessionId) return { action: 'not_supported' }
      return {
        action: mapWebhookType(event.type),
        sessionId: String(sessionId),
        amount: object.amount_received ?? object.amount,
      }
    },
  }
}
