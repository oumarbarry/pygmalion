import { describe, expect, it } from 'vitest'
import {
  budgetProgress,
  draftToPayload,
  emptyPromotionDraft,
  promotionDraftError,
  promotionToDraft,
  promotionValue,
  type ApiCampaign,
  type ApiPromotion,
  type PromotionDraft,
} from './promotion-form'

// Promotion wizard: the merchant answers in plain language, this translates to the
// promotions engine's shape (target/allocation/rules/campaign budget). The
// screens are API plumbing (playground e2e); this is the part that can be
// wrong silently, so it is tested here.

function draft(patch: Partial<PromotionDraft> = {}): PromotionDraft {
  return { ...emptyPromotionDraft('eur'), ...patch }
}

describe('promotionValue', () => {
  it('reads a percentage as an integer 1-100', () => {
    expect(promotionValue(draft({ kind: 'percent', value: '10' }))).toBe(10)
    expect(promotionValue(draft({ kind: 'percent', value: '0' }))).toBeNull()
    expect(promotionValue(draft({ kind: 'percent', value: '120' }))).toBeNull()
  })

  it('reads a fixed amount as minor units', () => {
    expect(promotionValue(draft({ kind: 'amount', value: '5,50' }))).toBe(550)
    expect(promotionValue(draft({ kind: 'amount', value: 'gratuit' }))).toBeNull()
  })

  it('is always 100% for "X achetés, Y offert"', () => {
    expect(promotionValue(draft({ kind: 'buyget', value: '' }))).toBe(100)
  })
})

describe('draftToPayload', () => {
  it('a % off the whole order spreads across every line, no target rule', () => {
    const { promotion, campaign } = draftToPayload(draft({ kind: 'percent', value: '10', code: 'ete' }), 'ETE')
    expect(campaign).toBeNull()
    expect(promotion.code).toBe('ETE')
    expect(promotion.type).toBe('standard')
    expect(promotion.applicationMethod).toMatchObject({ target: 'order', allocation: 'across', valueType: 'percentage', value: 10 })
    expect(promotion.applicationMethod.targetRules).toEqual([])
  })

  it('a fixed amount carries its currency (schema refuses it otherwise)', () => {
    const { promotion } = draftToPayload(draft({ kind: 'amount', value: '5', code: 'cinq' }), 'CINQ')
    expect(promotion.applicationMethod).toMatchObject({ valueType: 'fixed', value: 500, currencyCode: 'eur' })
  })

  it('a discount on chosen products targets items with a product_id rule', () => {
    const { promotion } = draftToPayload(
      draft({ kind: 'percent', value: '20', target: 'products', productIds: ['prod_1', 'prod_2'], code: 'x' }),
      'X',
    )
    expect(promotion.applicationMethod.target).toBe('items')
    expect(promotion.applicationMethod.allocation).toBe('each')
    expect(promotion.applicationMethod.targetRules).toEqual([{ attribute: 'product_id', operator: 'in', values: ['prod_1', 'prod_2'] }])
  })

  it('"une seule remise répartie" flips the allocation to across', () => {
    const { promotion } = draftToPayload(
      draft({ kind: 'percent', value: '20', target: 'products', productIds: ['prod_1'], splitAcross: true, code: 'x' }),
      'X',
    )
    expect(promotion.applicationMethod.allocation).toBe('across')
  })

  it('free delivery is a 100% promotion on the shipping target', () => {
    const { promotion } = draftToPayload(draft({ kind: 'percent', value: '100', target: 'shipping', code: 'livraison' }), 'LIVRAISON')
    expect(promotion.applicationMethod).toMatchObject({ target: 'shipping', valueType: 'percentage', value: 100 })
  })

  it('"pour 2 achetés, 1 offert" is a buyget at 100% with both quantities', () => {
    const { promotion } = draftToPayload(
      draft({ kind: 'buyget', target: 'categories', categoryIds: ['pcat_1'], buyQuantity: '2', getQuantity: '1', code: 'deux' }),
      'DEUX',
    )
    expect(promotion.type).toBe('buyget')
    expect(promotion.applicationMethod).toMatchObject({ value: 100, valueType: 'percentage', buyRulesMinQuantity: 2, applyToQuantity: 1 })
    const rule = { attribute: 'product_category_id', operator: 'in', values: ['pcat_1'] }
    expect(promotion.applicationMethod.buyRules).toEqual([rule])
    expect(promotion.applicationMethod.targetRules).toEqual([rule])
  })

  it('conditions become eligibility rules (minimum order, customer groups)', () => {
    const { promotion } = draftToPayload(
      draft({ kind: 'percent', value: '10', minSubtotal: '50', groupIds: ['cgrp_1'], code: 'vip' }),
      'VIP',
    )
    expect(promotion.rules).toEqual([
      { attribute: 'cart_subtotal', operator: 'gte', values: ['5000'] },
      { attribute: 'customer_group_id', operator: 'in', values: ['cgrp_1'] },
    ])
  })

  it('no budget and no dates means no campaign at all', () => {
    expect(draftToPayload(draft({ kind: 'percent', value: '10', code: 'x' }), 'X').campaign).toBeNull()
  })

  it('a spend budget becomes a campaign budget in minor units', () => {
    const { campaign } = draftToPayload(
      draft({ kind: 'percent', value: '10', code: 'x', budgetKind: 'spend', budgetLimit: '200' }),
      'X',
    )
    expect(campaign).toMatchObject({ name: 'X', budget: { type: 'spend', currencyCode: 'eur', limitAmount: 20000 } })
  })

  it('a usage budget is a plain count, and dates alone still need a campaign', () => {
    expect(draftToPayload(draft({ kind: 'percent', value: '10', code: 'x', budgetKind: 'usage', budgetLimit: '50' }), 'X').campaign)
      .toMatchObject({ budget: { type: 'usage', limitAmount: 50 } })
    expect(draftToPayload(draft({ kind: 'percent', value: '10', code: 'x', endsAt: '2026-12-31' }), 'X').campaign)
      .toMatchObject({ budget: null, endsAt: '2026-12-31' })
  })

  it('an automatic promotion sends no code', () => {
    const { promotion } = draftToPayload(draft({ kind: 'percent', value: '10', automatic: true, code: 'ignored' }), 'auto')
    expect(promotion.code).toBeUndefined()
    expect(promotion.isAutomatic).toBe(true)
  })
})

describe('promotionDraftError', () => {
  it('refuses a missing value, a missing code, and an empty target list', () => {
    expect(promotionDraftError(draft({ value: '' }))).toBe('promoValueRequired')
    expect(promotionDraftError(draft({ value: '10', code: '' }))).toBe('promoCodeRequired')
    expect(promotionDraftError(draft({ value: '10', code: 'x', target: 'products' }))).toBe('promoPickTargets')
    expect(promotionDraftError(draft({ value: '10', code: 'x' }))).toBeNull()
  })
})

describe('promotionToDraft', () => {
  const api = (patch: Partial<ApiPromotion> = {}): ApiPromotion => ({
    id: 'promo_1',
    code: 'ETE',
    isAutomatic: false,
    status: 'active',
    type: 'standard',
    campaignId: null,
    applicationMethod: { target: 'items', allocation: 'each', valueType: 'percentage', value: 15, currencyCode: null, buyRulesMinQuantity: null, applyToQuantity: null },
    rules: [],
    targetRules: [],
    buyRules: [],
    ...patch,
  })

  it('round-trips a product discount with its conditions and budget', () => {
    const campaign: ApiCampaign = {
      id: 'camp_1',
      name: 'ETE',
      description: null,
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-08-31T00:00:00.000Z',
      budget: { id: 'cbud_1', type: 'spend', currencyCode: 'eur', limitAmount: 20000, usedAmount: 4500 },
    }
    const restored = promotionToDraft(
      api({
        rules: [
          { attribute: 'cart_subtotal', operator: 'gte', values: ['5000'] },
          { attribute: 'customer_group_id', operator: 'in', values: ['cgrp_1'] },
        ],
        targetRules: [{ attribute: 'product_id', operator: 'in', values: ['prod_1'] }],
      }),
      campaign,
    )
    expect(restored).toMatchObject({
      kind: 'percent',
      value: '15',
      target: 'products',
      productIds: ['prod_1'],
      minSubtotal: '50.00',
      groupIds: ['cgrp_1'],
      budgetKind: 'spend',
      budgetLimit: '200.00',
      code: 'ETE',
      startsAt: '2026-06-01',
      endsAt: '2026-08-31',
    })
    // …and translates straight back to the same payload.
    expect(draftToPayload(restored, 'ETE').promotion.applicationMethod.targetRules)
      .toEqual([{ attribute: 'product_id', operator: 'in', values: ['prod_1'] }])
  })

  it('reads a buyget back as its two quantities', () => {
    const restored = promotionToDraft(
      api({
        type: 'buyget',
        applicationMethod: { target: 'order', allocation: 'each', valueType: 'percentage', value: 100, currencyCode: null, buyRulesMinQuantity: 3, applyToQuantity: 2 },
      }),
      null,
    )
    expect(restored).toMatchObject({ kind: 'buyget', target: 'order', buyQuantity: '3', getQuantity: '2' })
  })
})

describe('budgetProgress', () => {
  it('is null without a campaign or without a budget', () => {
    expect(budgetProgress(null)).toBeNull()
    expect(budgetProgress({ id: 'camp_1', name: 'x', description: null, startsAt: null, endsAt: null, budget: null })).toBeNull()
  })

  it('reports what is consumed against the cap', () => {
    expect(budgetProgress({
      id: 'camp_1',
      name: 'x',
      description: null,
      startsAt: null,
      endsAt: null,
      budget: { id: 'cbud_1', type: 'usage', currencyCode: null, limitAmount: 100, usedAmount: 12 },
    })).toEqual({ type: 'usage', used: 12, limit: 100, currency: 'eur' })
  })
})
