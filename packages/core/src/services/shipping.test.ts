// Shipping.
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { createProductsService, type ProductsService } from './products'
import { createPricingService, type PricingService } from './pricing'
import {
  createManualFulfillmentProvider,
  createShippingService,
  defaultFulfillmentProvider,
  geoZoneMatches,
  ruleMatches,
  type FulfillmentProvider,
  type FulfillmentProviderRegistry,
  type ShippingService,
} from './shipping'

function fakeFulfillmentProviders(providers: Record<string, FulfillmentProvider>): FulfillmentProviderRegistry {
  return {
    get<T>(type: 'fulfillment', id: string): T {
      const p = providers[id]
      if (!p) throw new Error(`no ${type} provider '${id}'`)
      return p as unknown as T
    },
  }
}

// --- Pure helpers (no DB) --------------------------------------------------------

describe('geoZoneMatches', () => {
  it('a country zone matches any address in that country', () => {
    expect(geoZoneMatches({ type: 'country', provinceCode: null, city: null, postalExpression: null }, { province: 'idf', city: 'Paris', postalCode: '75001' })).toBe(true)
  })

  it('a province zone only matches its own province', () => {
    const zone = { type: 'province' as const, provinceCode: 'idf', city: null, postalExpression: null }
    expect(geoZoneMatches(zone, { province: 'idf', city: null, postalCode: null })).toBe(true)
    expect(geoZoneMatches(zone, { province: 'paca', city: null, postalCode: null })).toBe(false)
  })

  it('a zip zone matches by postal code list or prefix', () => {
    const codes = { type: 'zip' as const, provinceCode: null, city: null, postalExpression: { codes: ['75001'] } }
    expect(geoZoneMatches(codes, { province: null, city: null, postalCode: '75001' })).toBe(true)
    expect(geoZoneMatches(codes, { province: null, city: null, postalCode: '75002' })).toBe(false)
    const prefix = { type: 'zip' as const, provinceCode: null, city: null, postalExpression: { prefix: '75' } }
    expect(geoZoneMatches(prefix, { province: null, city: null, postalCode: '75002' })).toBe(true)
    expect(geoZoneMatches(prefix, { province: null, city: null, postalCode: '69001' })).toBe(false)
  })
})

describe('ruleMatches', () => {
  it('ET strict comparisons against the cart rule context', () => {
    const ctx = { item_total: 5000, item_count: 2 }
    expect(ruleMatches({ attribute: 'item_total', operator: 'gte', value: 2000 }, ctx)).toBe(true)
    expect(ruleMatches({ attribute: 'item_total', operator: 'gte', value: 6000 }, ctx)).toBe(false)
    expect(ruleMatches({ attribute: 'item_count', operator: 'in', value: [1, 2, 3] }, ctx)).toBe(true)
    expect(ruleMatches({ attribute: 'unknown_attr', operator: 'eq', value: 1 }, ctx)).toBe(false)
  })
})

// --- Manual provider -------------------------------------------------------------

describe('manual fulfillment provider (Medusa parity)', () => {
  it('createFulfillment/cancelFulfillment are no-ops', async () => {
    const provider = createManualFulfillmentProvider()
    await expect(provider.createFulfillment({})).resolves.toEqual({ data: {} })
    await expect(provider.cancelFulfillment({})).resolves.toEqual({ data: {} })
  })

  it('canCalculate always returns false — manual is flat-only, like Medusa', async () => {
    const provider = createManualFulfillmentProvider()
    await expect(provider.canCalculate({})).resolves.toBe(false)
  })

  it('calculatePrice is left on the throwing default (never called — canCalculate gates it)', async () => {
    await expect(defaultFulfillmentProvider.calculatePrice({}, {}, {})).rejects.toThrow(/not supported/)
  })
})

// --- Service: cart matching + admin CRUD -----------------------------------------

let db: PygmalionDatabase
let shipping: ShippingService
let pricing: PricingService
let products: ProductsService
let regionId: string

beforeEach(async () => {
  db = await createTestDb(schema)
  const currencies = createCurrenciesService({ db })
  await currencies.seed()
  const regions = createRegionsService({ db })
  const region = await regions.create({ name: 'Cart Region', currencyCode: 'usd' })
  regionId = region.id
  pricing = createPricingService({ db })
  products = createProductsService({ db })
  const providers = fakeFulfillmentProviders({ manual: createManualFulfillmentProvider() })
  shipping = createShippingService({ db, pricing, providers })
})

describe('shipping options CRUD: calculated pricing requires provider support', () => {
  it("calculated → provider manuel refuse: creating a calculated option on 'manual' is rejected", async () => {
    const profile = await shipping.profiles.ensureDefault()
    const set = await shipping.fulfillmentSets.create({ name: 'Default' })
    const zone = await shipping.serviceZones.create(set.id, { name: 'World', geoZones: [{ type: 'country', countryCode: 'us' }] })
    await expect(
      shipping.options.create({
        name: 'Live rate',
        serviceZoneId: zone.id,
        shippingProfileId: profile.id,
        providerId: 'manual',
        priceType: 'calculated',
      }),
    ).rejects.toThrow(/does not support calculated/)
  })

  it('a flat option on manual is accepted', async () => {
    const profile = await shipping.profiles.ensureDefault()
    const set = await shipping.fulfillmentSets.create({ name: 'Default' })
    const zone = await shipping.serviceZones.create(set.id, { name: 'World', geoZones: [{ type: 'country', countryCode: 'us' }] })
    const option = await shipping.options.create({ name: 'Standard', serviceZoneId: zone.id, shippingProfileId: profile.id })
    expect(option.priceType).toBe('flat')
    expect(option.providerId).toBe('manual')
  })
})

describe('shipping service — listOptionsForCart (zone/profile/price matching)', () => {
  let profileId: string
  let frZoneId: string
  let frOptionId: string
  let deOptionId: string
  let idfOptionId: string

  beforeEach(async () => {
    const profile = await shipping.profiles.ensureDefault()
    profileId = profile.id
    const set = await shipping.fulfillmentSets.create({ name: 'Default' })

    const frZone = await shipping.serviceZones.create(set.id, { name: 'France', geoZones: [{ type: 'country', countryCode: 'fr' }] })
    frZoneId = frZone.id
    const deZone = await shipping.serviceZones.create(set.id, { name: 'Germany', geoZones: [{ type: 'country', countryCode: 'de' }] })
    const idfZone = await shipping.serviceZones.create(set.id, {
      name: 'Île-de-France express',
      geoZones: [{ type: 'province', countryCode: 'fr', provinceCode: 'idf' }],
    })

    const frOption = await shipping.options.create({ name: 'FR Standard', serviceZoneId: frZone.id, shippingProfileId: profileId })
    frOptionId = frOption.id
    const deOption = await shipping.options.create({ name: 'DE Standard', serviceZoneId: deZone.id, shippingProfileId: profileId })
    deOptionId = deOption.id
    const idfOption = await shipping.options.create({ name: 'IDF Express', serviceZoneId: idfZone.id, shippingProfileId: profileId })
    idfOptionId = idfOption.id

    await pricing.batchPrices({
      create: [
        { shippingOptionId: frOptionId, currencyCode: 'usd', amount: 500 },
        { shippingOptionId: deOptionId, currencyCode: 'usd', amount: 700 },
        { shippingOptionId: idfOptionId, currencyCode: 'usd', amount: 1500 },
      ],
    })
  })

  it('matching zone pays/province: a plain FR address matches the country zone but not the IDF-only province zone', async () => {
    const options = await shipping.listOptionsForCart({ currencyCode: 'usd', regionId, address: { countryCode: 'fr' }, items: [] })
    expect(options.map((o) => o.id).sort()).toEqual([frOptionId])
  })

  it('matching zone pays/province: an IDF address matches BOTH the country zone and the province-specific zone', async () => {
    const options = await shipping.listOptionsForCart({
      currencyCode: 'usd',
      regionId,
      address: { countryCode: 'fr', province: 'idf' },
      items: [],
    })
    expect(options.map((o) => o.id).sort()).toEqual([frOptionId, idfOptionId].sort())
  })

  it('option hors zone exclue: a DE address never sees the FR-only option', async () => {
    const options = await shipping.listOptionsForCart({ currencyCode: 'usd', regionId, address: { countryCode: 'de' }, items: [] })
    expect(options.map((o) => o.id)).toEqual([deOptionId])
  })

  it('no cart address -> no options (an option is always zone-scoped)', async () => {
    const options = await shipping.listOptionsForCart({ currencyCode: 'usd', regionId, address: null, items: [] })
    expect(options).toEqual([])
  })

  it('flat price resolved by currency context: usd resolves the seeded amount, a currency with no price excludes the option', async () => {
    const usd = await shipping.listOptionsForCart({ currencyCode: 'usd', regionId, address: { countryCode: 'fr' }, items: [] })
    expect(usd).toEqual([{ id: frOptionId, name: 'FR Standard', priceType: 'flat', amount: 500, isTaxInclusive: false, providerId: 'manual' }])

    const eur = await shipping.listOptionsForCart({ currencyCode: 'eur', regionId, address: { countryCode: 'fr' }, items: [] })
    expect(eur).toEqual([])

    await pricing.batchPrices({ create: [{ shippingOptionId: frOptionId, currencyCode: 'eur', amount: 450 }] })
    const eurAfter = await shipping.listOptionsForCart({ currencyCode: 'eur', regionId, address: { countryCode: 'fr' }, items: [] })
    expect(eurAfter.map((o) => o.amount)).toEqual([450])
  })

  it('profil produit filtre: an option scoped to a gift-card profile is invisible to a cart of physical products, and vice versa', async () => {
    const giftProfile = await shipping.profiles.create({ name: 'Gift cards' })
    const giftOption = await shipping.options.create({ name: 'No shipping needed', serviceZoneId: frZoneId, shippingProfileId: giftProfile.id })
    await pricing.batchPrices({ create: [{ shippingOptionId: giftOption.id, currencyCode: 'usd', amount: 0 }] })

    const physicalProduct = await products.create({ title: 'Mug' })
    const giftCardProduct = await products.create({ title: 'Gift card' })
    await shipping.profiles.updateProducts(giftProfile.id, { add: [giftCardProduct.id] })

    const physicalCart = await shipping.listOptionsForCart({
      currencyCode: 'usd',
      regionId,
      address: { countryCode: 'fr' },
      items: [{ productId: physicalProduct.id, unitPrice: 1000, quantity: 1 }],
    })
    expect(physicalCart.map((o) => o.id)).toEqual([frOptionId]) // default profile only, not the gift-card option

    const giftCart = await shipping.listOptionsForCart({
      currencyCode: 'usd',
      regionId,
      address: { countryCode: 'fr' },
      items: [{ productId: giftCardProduct.id, unitPrice: 2500, quantity: 1 }],
    })
    expect(giftCart.map((o) => o.id)).toEqual([giftOption.id])

    // Mixed-profile cart: no single option can satisfy both (single-shipping-method MVP).
    const mixedCart = await shipping.listOptionsForCart({
      currencyCode: 'usd',
      regionId,
      address: { countryCode: 'fr' },
      items: [
        { productId: physicalProduct.id, unitPrice: 1000, quantity: 1 },
        { productId: giftCardProduct.id, unitPrice: 2500, quantity: 1 },
      ],
    })
    expect(mixedCart).toEqual([])
  })

  it('eligibility rules (ET strict): an item_total threshold excludes the option until the cart is big enough', async () => {
    await shipping.options.update(frOptionId, { rules: [{ attribute: 'item_total', operator: 'gte', value: 5000 }] })

    const small = await shipping.listOptionsForCart({
      currencyCode: 'usd',
      regionId,
      address: { countryCode: 'fr' },
      items: [{ productId: null, unitPrice: 1000, quantity: 1 }],
    })
    expect(small).toEqual([])

    const big = await shipping.listOptionsForCart({
      currencyCode: 'usd',
      regionId,
      address: { countryCode: 'fr' },
      items: [{ productId: null, unitPrice: 6000, quantity: 1 }],
    })
    expect(big.map((o) => o.id)).toEqual([frOptionId])
  })

  it('resolveForCart returns the eligible option and throws for one that is not eligible', async () => {
    const resolved = await shipping.resolveForCart({ currencyCode: 'usd', regionId, address: { countryCode: 'fr' }, items: [] }, frOptionId)
    expect(resolved).toEqual({ shippingOptionId: frOptionId, name: 'FR Standard', amount: 500, isTaxInclusive: false })

    await expect(
      shipping.resolveForCart({ currencyCode: 'usd', regionId, address: { countryCode: 'de' }, items: [] }, frOptionId),
    ).rejects.toThrow(/not eligible/)
  })
})

describe('shipping service — calculated price_type (a provider that DOES support it)', () => {
  it('calls the provider calculatePrice with the option data and returns its amount', async () => {
    const liveRateProvider: FulfillmentProvider = {
      getIdentifier: () => 'live-rate',
      async createFulfillment() {
        return { data: {} }
      },
      async cancelFulfillment() {
        return { data: {} }
      },
      async canCalculate() {
        return true
      },
      async calculatePrice(optionData) {
        return { calculatedAmount: Number(optionData.baseRate ?? 0) * 2, isCalculatedPriceTaxInclusive: false }
      },
    }
    const providers = fakeFulfillmentProviders({ manual: createManualFulfillmentProvider(), 'live-rate': liveRateProvider })
    const calcShipping = createShippingService({ db, pricing, providers })

    const profile = await calcShipping.profiles.ensureDefault()
    const set = await calcShipping.fulfillmentSets.create({ name: 'Default' })
    const zone = await calcShipping.serviceZones.create(set.id, { name: 'US', geoZones: [{ type: 'country', countryCode: 'us' }] })
    const option = await calcShipping.options.create({
      name: 'Live rate',
      serviceZoneId: zone.id,
      shippingProfileId: profile.id,
      providerId: 'live-rate',
      priceType: 'calculated',
      data: { baseRate: 300 },
    })

    const options = await calcShipping.listOptionsForCart({ currencyCode: 'usd', regionId, address: { countryCode: 'us' }, items: [] })
    expect(options).toEqual([{ id: option.id, name: 'Live rate', priceType: 'calculated', amount: 600, isTaxInclusive: false, providerId: 'live-rate' }])
  })
})
