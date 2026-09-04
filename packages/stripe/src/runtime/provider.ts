import Stripe from 'stripe'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { ProviderDescriptor } from '@oumarbarry/pygmalion'
import { createStripePaymentProvider, type StripeLike, type StripeProviderOptions } from '../provider'

// The provider descriptor registered through `pygmalion:providers`.
// The factory runs on first resolution: it reads `runtimeConfig.stripe` and
// builds a real Stripe client (the `manual` fallback stays available for dev).
const descriptors: ProviderDescriptor[] = [
  {
    type: 'payment',
    id: 'stripe',
    factory: () => {
      const rc = useRuntimeConfig().stripe as { secretKey?: string; webhookSecret?: string; captureMethod?: StripeProviderOptions['captureMethod'] } | undefined
      if (!rc?.secretKey) throw new Error('stripe: runtimeConfig.stripe.secretKey is not set')
      // Cast at the SDK boundary: the real client's strongly-typed params are
      // a subset of our deliberately-loose `StripeLike` (which the unit mock
      // satisfies exactly); the provider builds correct params internally.
      const stripe = new Stripe(rc.secretKey) as unknown as StripeLike
      return createStripePaymentProvider(stripe, { captureMethod: rc.captureMethod, webhookSecret: rc.webhookSecret })
    },
  },
]

export default descriptors
