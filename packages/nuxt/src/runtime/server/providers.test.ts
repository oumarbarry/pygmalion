import { describe, expect, it, vi } from 'vitest'
import { createProviderRegistry } from './providers'
import type { ProviderDescriptor, PygmalionContext } from './types'

const ctx = {} as PygmalionContext

describe('createProviderRegistry', () => {
  it('resolves a registered provider and passes the context to the factory', () => {
    const factory = vi.fn(() => ({ send: () => 'ok' }))
    const descriptors: ProviderDescriptor[] = [{ type: 'notification', id: 'console', factory }]
    const registry = createProviderRegistry(descriptors, () => ctx)

    const provider = registry.get<{ send: () => string }>('notification', 'console')
    expect(provider.send()).toBe('ok')
    expect(factory).toHaveBeenCalledWith(ctx)
  })

  it('memoizes: the factory runs once across repeated gets', () => {
    const factory = vi.fn(() => ({}))
    const registry = createProviderRegistry(
      [{ type: 'payment', id: 'fake', factory }],
      () => ctx,
    )
    registry.get('payment', 'fake')
    registry.get('payment', 'fake')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('throws for an unknown provider', () => {
    const registry = createProviderRegistry([], () => ctx)
    expect(() => registry.get('tax', 'nope')).toThrow(/no tax provider/)
  })

  it('lists the ids registered for a type, without instantiating them', () => {
    const taxFactory = vi.fn(() => ({}))
    const registry = createProviderRegistry(
      [
        { type: 'tax', id: 'system', factory: taxFactory },
        { type: 'tax', id: 'avalara', factory: taxFactory },
        { type: 'payment', id: 'manual', factory: () => ({}) },
      ],
      () => ctx,
    )
    expect(registry.list('tax')).toEqual([
      { type: 'tax', id: 'system' },
      { type: 'tax', id: 'avalara' },
    ])
    expect(registry.list('payment')).toEqual([{ type: 'payment', id: 'manual' }])
    expect(registry.list('notification')).toEqual([])
    expect(taxFactory).not.toHaveBeenCalled()
  })
})
