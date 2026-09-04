import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

/**
 * The storefront composables, unit-tested against a fake SDK client.
 *
 * `useState`/`useCookie` are Nuxt runtime helpers; here they are plain refs
 * held in a per-test registry, which is exactly their contract (shared,
 * SSR-stable state keyed by a string). What's under test is OUR logic: which
 * call each action makes, and what it derives from the answer. The real HTTP
 * round-trip is covered by the playground E2E suites.
 */
const state = new Map<string, ReturnType<typeof ref>>()
const cookies = new Map<string, ReturnType<typeof ref>>()

vi.mock('nuxt/app', () => ({
  useState: <T>(key: string, init: () => T) => {
    if (!state.has(key)) state.set(key, ref(init()))
    return state.get(key)!
  },
  useCookie: <T>(key: string) => {
    if (!cookies.has(key)) cookies.set(key, ref(null))
    return cookies.get(key)!
  },
  useNuxtApp: () => ({}),
  useRequestEvent: () => undefined,
}))

const client = {
  store: {
    regions: { list: vi.fn() },
    carts: {
      get: vi.fn(),
      create: vi.fn(),
      addPromotions: vi.fn(),
      removePromotions: vi.fn(),
      transferToCustomer: vi.fn(),
    },
    paymentProviders: { list: vi.fn() },
  },
}
vi.mock('./use-pygmalion', () => ({ usePygmalion: () => client }))

const { useCart } = await import('./use-cart')
const { useCheckout } = await import('./use-checkout')
const { useRegion } = await import('./use-region')

const cartWith = (adjustments: { code: string | null }[]) => ({
  id: 'cart_1',
  total: 1000,
  items: [{ id: 'li_1', quantity: 2, adjustments }],
  shippingMethods: [],
})

beforeEach(() => {
  state.clear()
  cookies.clear()
  vi.clearAllMocks()
})

describe('useRegion', () => {
  const regions = [
    { id: 'reg_eu', name: 'Europe', currencyCode: 'eur' },
    { id: 'reg_us', name: 'United States', currencyCode: 'usd' },
  ]

  it('loads once and defaults to the store first region', async () => {
    client.store.regions.list.mockResolvedValue({ regions })
    const { load, region, currencyCode } = useRegion()

    expect(await load()).toMatchObject({ id: 'reg_eu' })
    await load()
    expect(client.store.regions.list).toHaveBeenCalledTimes(1) // cached in shared state
    expect(region.value?.id).toBe('reg_eu')
    expect(currencyCode.value).toBe('eur')
  })

  it('follows the selection, and drops a cookie pointing at a region that is gone', async () => {
    client.store.regions.list.mockResolvedValue({ regions })
    const { load, select, region, regionId } = useRegion()
    await load()

    select('reg_us')
    expect(region.value?.currencyCode).toBe('usd')
    expect(regionId.value).toBe('reg_us')

    select('reg_deleted')
    await load()
    expect(region.value?.id).toBe('reg_eu') // fell back, no crash on a stale cookie
  })
})

describe('useCart — promotions and customer transfer', () => {
  it('applies a code and takes the server-recomputed cart as the truth', async () => {
    cookies.set('pygmalion_cart', ref('cart_1'))
    client.store.carts.get.mockResolvedValue({ cart: cartWith([]) })
    client.store.carts.addPromotions.mockResolvedValue({ cart: { ...cartWith([{ code: 'BIENVENUE10' }]), total: 900 } })

    const { refresh, applyPromoCode, promoCodes, cart } = useCart()
    await refresh()
    await applyPromoCode('BIENVENUE10')

    expect(client.store.carts.addPromotions).toHaveBeenCalledWith('cart_1', { promotionCodes: ['BIENVENUE10'] })
    expect(cart.value?.total).toBe(900) // the API's number, not a local subtraction
    expect(promoCodes.value).toEqual(['BIENVENUE10'])
  })

  it('lists only removable codes — an automatic promotion has none', async () => {
    cookies.set('pygmalion_cart', ref('cart_1'))
    client.store.carts.get.mockResolvedValue({ cart: cartWith([{ code: null }, { code: 'BIENVENUE10' }, { code: 'BIENVENUE10' }]) })

    const { refresh, promoCodes } = useCart()
    await refresh()

    expect(promoCodes.value).toEqual(['BIENVENUE10'])
  })

  it('removes a code through the API', async () => {
    cookies.set('pygmalion_cart', ref('cart_1'))
    client.store.carts.get.mockResolvedValue({ cart: cartWith([{ code: 'BIENVENUE10' }]) })
    client.store.carts.removePromotions.mockResolvedValue({ cart: cartWith([]) })

    const { refresh, removePromoCode, promoCodes } = useCart()
    await refresh()
    await removePromoCode('BIENVENUE10')

    expect(client.store.carts.removePromotions).toHaveBeenCalledWith('cart_1', { promotionCodes: ['BIENVENUE10'] })
    expect(promoCodes.value).toEqual([])
  })

  it('attaches the signed-in customer, and is a no-op without a cart', async () => {
    const { attachCustomer } = useCart()
    expect(await attachCustomer()).toBeNull()
    expect(client.store.carts.transferToCustomer).not.toHaveBeenCalled()

    cookies.get('pygmalion_cart')!.value = 'cart_1'
    client.store.carts.transferToCustomer.mockResolvedValue({ cart: { ...cartWith([]), customerId: 'cus_1' } })
    expect(await attachCustomer()).toMatchObject({ customerId: 'cus_1' })
  })
})

describe('useCheckout — payment providers', () => {
  it('exposes what the provider registry actually has', async () => {
    client.store.paymentProviders.list.mockResolvedValue({ paymentProviders: [{ type: 'payment', id: 'manual' }] })
    const { loadPaymentProviders, paymentProviders } = useCheckout()

    await loadPaymentProviders()

    expect(paymentProviders.value.map((p) => p.id)).toEqual(['manual'])
  })
})
