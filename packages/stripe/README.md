# @oumarbarry/pygmalion-stripe

Stripe payment provider for [Pygmalion](https://github.com/oumarbarry/pygmalion):
PaymentIntents with manual capture (authorize at checkout, capture at
shipment) and a signed webhook at `POST /api/pygmalion/stripe/webhook`.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@oumarbarry/pygmalion', '@oumarbarry/pygmalion-stripe'],
  runtimeConfig: {
    stripe: { secretKey: '', webhookSecret: '', captureMethod: 'manual' },
  },
})
```

Provide the secrets through `NUXT_STRIPE_SECRET_KEY` and
`NUXT_STRIPE_WEBHOOK_SECRET`. The server returns the PaymentIntent's client
secret; mounting Stripe's Payment Element is up to the storefront.

It is also the reference example of a Pygmalion module: one provider
registered through the `pygmalion:providers` hook, one route, nothing else.
