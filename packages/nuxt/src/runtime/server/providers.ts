import type {
  ProviderDescriptor,
  ProviderRegistry,
  ProviderType,
  PygmalionContext,
} from './types'

/**
 * Runtime resolution for registered providers. Descriptors are collected at build time
 * (via `pygmalion:providers`) and instantiated lazily on first `get`, memoized
 * thereafter. `getCtx` breaks the ctx<->registry cycle: the registry lives on
 * the context, and a factory receives that same context when resolved.
 */
export function createProviderRegistry(
  descriptors: ProviderDescriptor[],
  getCtx: () => PygmalionContext,
): ProviderRegistry {
  const cache = new Map<string, unknown>()
  return {
    get<T = unknown>(type: ProviderType, id: string): T {
      const key = `${type}:${id}`
      const cached = cache.get(key)
      if (cached !== undefined) return cached as T
      const descriptor = descriptors.find((d) => d.type === type && d.id === id)
      if (!descriptor) {
        throw new Error(`pygmalion: no ${type} provider registered with id '${id}'`)
      }
      const instance = descriptor.factory(getCtx())
      cache.set(key, instance)
      return instance as T
    },
    // Introspection for the `*-providers` list endpoints (tax/payment/
    // fulfillment). Reads the descriptors only — a provider is NEVER
    // instantiated just to be listed.
    list(type: ProviderType) {
      return descriptors.filter((d) => d.type === type).map((d) => ({ type: d.type, id: d.id }))
    },
  }
}
