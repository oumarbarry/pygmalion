import { addServerHandler, createResolver, defineNuxtModule, logger } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
// Type-only import pulls in @oumarbarry/pygmalion's `declare module '@nuxt/schema'`
// hook augmentation, so `nuxt.hook('pygmalion:providers', …)` is typed.
import type { SpecifierRegistry } from '@oumarbarry/pygmalion'

export interface StripeModuleOptions {
  captureMethod?: 'manual' | 'automatic'
}

// @oumarbarry/pygmalion-stripe, the reference example of a Pygmalion module.
// Registers the Stripe payment provider and its webhook route; secrets come
// from `runtimeConfig.stripe` (overridable by env: NUXT_STRIPE_SECRET_KEY …).
const module: NuxtModule<StripeModuleOptions> = defineNuxtModule<StripeModuleOptions>({
  meta: { name: '@oumarbarry/pygmalion-stripe', configKey: 'pygmalionStripe' },
  defaults: { captureMethod: 'manual' },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    nuxt.options.runtimeConfig.stripe = {
      secretKey: '',
      webhookSecret: '',
      captureMethod: options.captureMethod ?? 'manual',
      ...(nuxt.options.runtimeConfig.stripe as Record<string, unknown> | undefined),
    }

    nuxt.hook('pygmalion:providers', (registry: SpecifierRegistry) => {
      registry.add(resolve('./runtime/provider'))
    })

    addServerHandler({
      route: '/api/pygmalion/stripe/webhook',
      method: 'post',
      handler: resolve('./runtime/webhook.post'),
    })

    logger.info('@oumarbarry/pygmalion-stripe installed')
  },
})

export default module

// Programmatic surface (provider factory + types) for advanced consumers.
export { createStripePaymentProvider, mapIntentStatus, type StripeLike, type StripeProviderOptions } from './provider'
export { enqueueStripeWebhook } from './webhook'
