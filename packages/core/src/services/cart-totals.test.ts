import { describe, expect, it } from 'vitest'
import { base, initCartTotalsState, promotions, runCartTotalsPipeline, shipping, sum, tax, type TaxStepDeps } from './cart-totals'
import type { TaxLine } from './tax'

// Fake tax provider: a fixed rate table per calculation-item id, so these
// tests exercise cart-totals.ts's own arithmetic in isolation from the real
// tax service/db (already covered by tax.test.ts).
function fakeTaxDeps(ratesByItemId: Record<string, Array<{ rateId: string; rate: number; code: string; name: string }>>): TaxStepDeps {
  return {
    taxService: {
      async getTaxLines(items): Promise<TaxLine[]> {
        return items.flatMap((item) =>
          (ratesByItemId[item.id] ?? []).map((r) => ({
            itemId: item.id,
            rateId: r.rateId,
            rate: r.rate,
            code: r.code,
            name: r.name,
            providerId: 'system',
          })),
        )
      },
    },
  }
}

const US_ADDRESS = { countryCode: 'us' }

describe('cart-totals — base step', () => {
  it('gross = unitPrice * quantity for items, amount for shipping', () => {
    const state = initCartTotalsState({
      currencyCode: 'usd',
      address: null,
      items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 333, quantity: 3, isTaxInclusive: false }],
      shippingMethods: [{ id: 'sm_1', shippingOptionId: null, amount: 500, isTaxInclusive: false }],
    })
    const s = base(state)
    expect(s.items[0].subtotal).toBe(999)
    expect(s.items[0].total).toBe(999)
    expect(s.shippingMethods[0].subtotal).toBe(500)
  })
})

describe('cart-totals — promotions step (frozen interface, identity without deps)', () => {
  it('is the identity function', () => {
    const state = initCartTotalsState({
      currencyCode: 'usd',
      address: null,
      items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1000, quantity: 1, isTaxInclusive: false }],
      shippingMethods: [],
    })
    const s = base(state)
    expect(promotions(s)).toEqual(s)
  })
})

describe('cart-totals — promotions step wired to the real engine', () => {
  it('with deps: delegates to computeAdjustments and writes discountTotal, feeding into tax/sum downstream', async () => {
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: null,
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1000, quantity: 1, isTaxInclusive: false }],
        shippingMethods: [],
      }),
    )
    const deps = {
      promotions: [
        {
          id: 'promo_1',
          code: 'SAVE10',
          type: 'standard' as const,
          rules: [],
          application: {
            target: 'items' as const,
            allocation: 'each' as const,
            valueType: 'percentage' as const,
            value: 10,
            maxQuantity: null,
            buyRulesMinQuantity: null,
            applyToQuantity: null,
            targetRules: [],
            buyRules: [],
          },
          campaign: null,
        },
      ],
      context: {
        now: new Date(),
        currencyCode: 'usd',
        regionId: null,
        customerGroupIds: [],
        attributeValues: {},
        items: {},
        shippingMethods: {},
      },
    }
    const s = promotions(state, deps)
    expect(s.items[0].discountTotal).toBe(100)

    const deps2 = { taxService: { async getTaxLines() { return [] } } }
    const summed = sum(await tax(shipping(s), deps2))
    expect(summed.itemsSubtotal).toBe(1000)
    expect(summed.discountTotal).toBe(100)
    expect(summed.total).toBe(900)
  })
})

describe('cart-totals — shipping step (identity, extension point for later)', () => {
  it('is the identity function', () => {
    const state = initCartTotalsState({ currencyCode: 'usd', address: null, items: [], shippingMethods: [] })
    expect(shipping(state)).toEqual(state)
  })
})

describe('cart-totals — tax step: named numeric cases (in cents)', () => {
  it('tax-exclusive: 10% on a 20.00 line (qty 2 @ 10.00) adds tax on top', async () => {
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: US_ADDRESS,
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1000, quantity: 2, isTaxInclusive: false }],
        shippingMethods: [],
      }),
    )
    const deps = fakeTaxDeps({ li_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }] })
    const s = await tax(state, deps)
    const li = s.items[0]
    expect(li.subtotal).toBe(2000) // exclusive: subtotal unchanged
    expect(li.taxTotal).toBe(200) // 10% of 2000
    expect(li.total).toBe(2200)
  })

  it('tax-inclusive: an 11.00 line already contains 10% tax -> net subtotal is 10.00', async () => {
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: US_ADDRESS,
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1100, quantity: 1, isTaxInclusive: true }],
        shippingMethods: [],
      }),
    )
    const deps = fakeTaxDeps({ li_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }] })
    const s = await tax(state, deps)
    const li = s.items[0]
    expect(li.subtotal).toBe(1000) // 1100 / 1.10
    expect(li.taxTotal).toBe(100)
    expect(li.total).toBe(1100) // unchanged from gross — tax was already embedded
  })

  it('adjustments: a discount already applied before `tax` reduces the taxable base, not the exclusive subtotal', async () => {
    // Simulates what the `promotions` step will have written by the
    // time `tax` runs: `discountTotal` set, everything else still base's.
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: US_ADDRESS,
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1000, quantity: 1, isTaxInclusive: false }],
        shippingMethods: [],
      }),
    )
    state.items[0].discountTotal = 200
    const deps = fakeTaxDeps({ li_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }] })
    const s = await tax(state, deps)
    const li = s.items[0]
    expect(li.subtotal).toBe(1000) // exclusive: unaffected by the discount
    expect(li.taxTotal).toBe(80) // 10% of (1000 - 200)
    expect(li.total).toBe(880) // (1000 - 200) + 80
  })

  it('quantity: gross scales linearly and so does tax', async () => {
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: US_ADDRESS,
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 250, quantity: 4, isTaxInclusive: false }],
        shippingMethods: [],
      }),
    )
    const deps = fakeTaxDeps({ li_1: [{ rateId: 'txr_1', rate: 20, code: 'STD', name: 'Standard' }] })
    const s = await tax(state, deps)
    const li = s.items[0]
    expect(li.subtotal).toBe(1000) // 250 * 4
    expect(li.taxTotal).toBe(200) // 20%
    expect(li.total).toBe(1200)
  })

  it('no address -> no tax at all, gross carried through unchanged', async () => {
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: null,
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1100, quantity: 1, isTaxInclusive: true }],
        shippingMethods: [],
      }),
    )
    const deps = fakeTaxDeps({ li_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }] })
    const s = await tax(state, deps)
    expect(s.items[0].taxTotal).toBe(0)
    expect(s.items[0].total).toBe(1100)
  })

  it('combinable multi-rate (province + country): each tax line computed independently on the same taxable base', async () => {
    const state = base(
      initCartTotalsState({
        currencyCode: 'usd',
        address: { countryCode: 'us', provinceCode: 'ca' },
        items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 10000, quantity: 1, isTaxInclusive: false }],
        shippingMethods: [],
      }),
    )
    const deps = fakeTaxDeps({
      li_1: [
        { rateId: 'txr_ca', rate: 5, code: 'CA', name: 'California' },
        { rateId: 'txr_us', rate: 2, code: 'US', name: 'Federal' },
      ],
    })
    const s = await tax(state, deps)
    const li = s.items[0]
    expect(li.taxLines).toHaveLength(2)
    expect(li.taxLines.map((t) => t.amount)).toEqual([500, 200])
    expect(li.taxTotal).toBe(700)
    expect(li.total).toBe(10700)
  })
})

describe('cart-totals — sum step: cart-level identity', () => {
  it('total === itemsSubtotal + shippingTotal - discountTotal + taxTotal', async () => {
    const state = initCartTotalsState({
      currencyCode: 'usd',
      address: US_ADDRESS,
      items: [
        { id: 'li_1', productId: 'prod_1', unitPrice: 1000, quantity: 2, isTaxInclusive: false },
        { id: 'li_2', productId: 'prod_2', unitPrice: 1100, quantity: 1, isTaxInclusive: true },
      ],
      shippingMethods: [{ id: 'sm_1', shippingOptionId: 'so_1', amount: 500, isTaxInclusive: false }],
    })
    const deps = fakeTaxDeps({
      li_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }],
      li_2: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }],
      sm_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }],
    })
    let s = base(state)
    s = promotions(s)
    s = shipping(s)
    s = await tax(s, deps)
    s = sum(s)

    expect(s.itemsSubtotal).toBe(3000) // 2000 (exclusive) + 1000 (inclusive net)
    expect(s.shippingTotal).toBe(500)
    expect(s.discountTotal).toBe(0)
    expect(s.taxTotal).toBe(200 + 100 + 50) // 350
    expect(s.total).toBe(2200 + 1100 + 550) // 3850
    expect(s.total).toBe(s.itemsSubtotal + s.shippingTotal - s.discountTotal + s.taxTotal)
  })
})

describe('cart-totals — runCartTotalsPipeline orchestrator', () => {
  it('runs base -> promotions -> shipping -> tax -> sum end to end', async () => {
    const state = initCartTotalsState({
      currencyCode: 'usd',
      address: US_ADDRESS,
      items: [{ id: 'li_1', productId: 'prod_1', unitPrice: 1000, quantity: 1, isTaxInclusive: false }],
      shippingMethods: [],
    })
    const deps = fakeTaxDeps({ li_1: [{ rateId: 'txr_1', rate: 10, code: 'STD', name: 'Standard' }] })
    const s = await runCartTotalsPipeline(state, deps)
    expect(s.items[0].total).toBe(1100)
    expect(s.total).toBe(1100)
  })
})
