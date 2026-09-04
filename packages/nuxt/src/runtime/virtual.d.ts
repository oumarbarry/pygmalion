// Ambient types for the build-time virtual modules (aliased in module.ts).
declare module '#pygmalion/schema' {
  export const schema: Record<string, unknown>
}

declare module '#pygmalion/providers' {
  import type { ProviderDescriptor } from './server/types'
  export const providerDescriptors: ProviderDescriptor[]
}

declare module '#pygmalion/customer-auth-options' {
  import type { BetterAuthOptions } from 'better-auth'
  export const customerAuthOptions: Partial<BetterAuthOptions>
}
