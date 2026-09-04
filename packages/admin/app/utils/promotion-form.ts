/**
 * The only non-UI logic of the Promotions section: turning what a
 * merchant answered in plain language ("10% off, on these products, for
 * orders over 50€, capped at 200€ of discount") into the shape
 * `POST /api/admin/promotions` (+ `/api/admin/campaigns`) expects, and back.
 *
 * Pure, framework-free, unit-tested next to this file, same treatment as
 * `variants.ts`/`money.ts`. The API vocabulary (applicationMethod,
 * allocation, rules, campaign budget) never leaks into a page: pages speak
 * `PromotionDraft`, this file speaks the engine.
 *
 * Engine facts this file encodes (packages/core/src/services/promotions-engine.ts):
 * - `target: 'order'` ignores targetRules and discounts every item line;
 *   `'items'` filters by targetRules; `'shipping'` discounts delivery.
 * - eligibility attributes are a closed set: `cart_subtotal`,
 *   `customer_group_id`, `region_id`, `currency_code`.
 * - item attributes are a closed set too: `product_id`,
 *   `product_category_id`, `product_tag_id`, `item_quantity`; there is
 *   **no** collection attribute.
 * - a promotion carries no dates and no budget: both live on its campaign,
 *   so a promo that has either gets one campaign of its own.
 */
import { minorToAmountInput, parseAmountToMinor } from './money'

export type PromoKind = 'percent' | 'amount' | 'buyget'
/** What the discount lands on, in merchant words. */
export type PromoTarget = 'order' | 'products' | 'categories' | 'shipping'
export type PromoBudgetKind = 'none' | 'spend' | 'usage'

export interface PromotionDraft {
  kind: PromoKind
  /** Percent as an integer string ('10'), or a money input ('5,00') for `amount`. */
  value: string
  currency: string
  target: PromoTarget
  productIds: string[]
  categoryIds: string[]
  /** items only: one discount spread over the matching lines instead of one per line. */
  splitAcross: boolean
  buyQuantity: string
  getQuantity: string
  /** Money input — minimum order value before the promotion applies. */
  minSubtotal: string
  groupIds: string[]
  budgetKind: PromoBudgetKind
  /** Money input when `spend`, a plain count when `usage`. */
  budgetLimit: string
  automatic: boolean
  code: string
  /** `yyyy-mm-dd` (native date input), or '' for "no limit". */
  startsAt: string
  endsAt: string
}

export function emptyPromotionDraft(currency = 'eur'): PromotionDraft {
  return {
    kind: 'percent',
    value: '',
    currency,
    target: 'order',
    productIds: [],
    categoryIds: [],
    splitAcross: false,
    buyQuantity: '2',
    getQuantity: '1',
    minSubtotal: '',
    groupIds: [],
    budgetKind: 'none',
    budgetLimit: '',
    automatic: false,
    code: '',
    startsAt: '',
    endsAt: '',
  }
}

export interface RulePayload {
  attribute: string
  operator?: 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'
  values: string[]
}

export interface ApplicationMethodPayload {
  target: 'order' | 'items' | 'shipping'
  allocation: 'each' | 'across' | 'once'
  valueType: 'fixed' | 'percentage'
  value: number
  currencyCode?: string
  buyRulesMinQuantity?: number
  applyToQuantity?: number
  targetRules: RulePayload[]
  buyRules: RulePayload[]
}

export interface CampaignPayload {
  name: string
  startsAt: string | null
  endsAt: string | null
  budget: { type: 'spend' | 'usage'; currencyCode?: string; limitAmount: number | null } | null
}

export interface PromotionPayload {
  /** `null` when the merchant set neither budget nor dates — no campaign needed. */
  campaign: CampaignPayload | null
  promotion: {
    code?: string
    isAutomatic: boolean
    status: 'active' | 'inactive' | 'draft'
    type: 'standard' | 'buyget'
    rules: RulePayload[]
    applicationMethod: ApplicationMethodPayload
  }
}

/** The rules that say WHICH items the discount lands on. */
function itemRules(draft: PromotionDraft): RulePayload[] {
  if (draft.target === 'products' && draft.productIds.length) {
    return [{ attribute: 'product_id', operator: 'in', values: draft.productIds }]
  }
  if (draft.target === 'categories' && draft.categoryIds.length) {
    return [{ attribute: 'product_category_id', operator: 'in', values: draft.categoryIds }]
  }
  return []
}

/** The rules that say WHEN the promotion is allowed at all (cart-level). */
export function eligibilityRules(draft: PromotionDraft): RulePayload[] {
  const rules: RulePayload[] = []
  const min = parseAmountToMinor(draft.minSubtotal, draft.currency)
  if (min !== null && min > 0) {
    rules.push({ attribute: 'cart_subtotal', operator: 'gte', values: [String(min)] })
  }
  if (draft.groupIds.length) {
    rules.push({ attribute: 'customer_group_id', operator: 'in', values: [...draft.groupIds] })
  }
  return rules
}

/** Percent -> integer 0-100. Amount -> minor units. `null` when unusable. */
export function promotionValue(draft: PromotionDraft): number | null {
  if (draft.kind === 'buyget') return 100 // "offert" = 100% off the free units
  if (draft.kind === 'percent') {
    const percent = Number.parseInt(draft.value.trim(), 10)
    return Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : null
  }
  const minor = parseAmountToMinor(draft.value, draft.currency)
  return minor !== null && minor > 0 ? minor : null
}

function quantity(input: string, fallback: number): number {
  const n = Number.parseInt(input.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function apiTarget(draft: PromotionDraft): 'order' | 'items' | 'shipping' {
  if (draft.target === 'shipping') return 'shipping'
  if (draft.target === 'order') return 'order'
  return 'items'
}

export function applicationMethod(draft: PromotionDraft): ApplicationMethodPayload {
  const rules = itemRules(draft)
  const value = promotionValue(draft) ?? 0

  if (draft.kind === 'buyget') {
    return {
      // 'order' keeps "buy 2 of anything" possible: the engine reads every
      // item line as a target when the target is the whole order.
      target: draft.target === 'shipping' ? 'shipping' : apiTarget(draft),
      allocation: 'each', // ignored by the BuyGet path, sent for schema completeness
      valueType: 'percentage',
      value,
      buyRulesMinQuantity: quantity(draft.buyQuantity, 2),
      applyToQuantity: quantity(draft.getQuantity, 1),
      targetRules: rules,
      buyRules: rules,
    }
  }

  return {
    target: apiTarget(draft),
    // A whole-order or delivery discount is one amount over the concerned
    // lines; only a product/category discount can sensibly repeat per line.
    allocation: draft.target === 'products' || draft.target === 'categories' ? (draft.splitAcross ? 'across' : 'each') : 'across',
    valueType: draft.kind === 'percent' ? 'percentage' : 'fixed',
    value,
    ...(draft.kind === 'amount' ? { currencyCode: draft.currency } : {}),
    targetRules: rules,
    buyRules: [],
  }
}

function campaignPayload(draft: PromotionDraft, name: string): CampaignPayload | null {
  const limit = draft.budgetKind === 'spend'
    ? parseAmountToMinor(draft.budgetLimit, draft.currency)
    : draft.budgetKind === 'usage'
      ? quantity(draft.budgetLimit, 0) || null
      : null
  const hasBudget = draft.budgetKind !== 'none' && limit !== null && limit > 0
  const hasDates = Boolean(draft.startsAt || draft.endsAt)
  if (!hasBudget && !hasDates) return null
  return {
    name,
    startsAt: draft.startsAt || null,
    endsAt: draft.endsAt || null,
    budget: hasBudget
      ? {
          type: draft.budgetKind as 'spend' | 'usage',
          ...(draft.budgetKind === 'spend' ? { currencyCode: draft.currency } : {}),
          limitAmount: limit,
        }
      : null,
  }
}

/**
 * `campaignName` is what the merchant sees in the Campagnes screen for the
 * campaign this promotion needs — the code, or the fallback the page passes
 * for an automatic promotion.
 */
export function draftToPayload(draft: PromotionDraft, campaignName: string, status: 'active' | 'inactive' | 'draft' = 'active'): PromotionPayload {
  const code = draft.code.trim().toUpperCase()
  return {
    campaign: campaignPayload(draft, campaignName),
    promotion: {
      ...(draft.automatic || !code ? {} : { code }),
      isAutomatic: draft.automatic,
      status,
      type: draft.kind === 'buyget' ? 'buyget' : 'standard',
      rules: eligibilityRules(draft),
      applicationMethod: applicationMethod(draft),
    },
  }
}

/** What the wizard/edit screen must refuse to submit, as a vocabulary key. */
export function promotionDraftError(draft: PromotionDraft): 'promoValueRequired' | 'promoCodeRequired' | 'promoPickTargets' | null {
  if (promotionValue(draft) === null) return 'promoValueRequired'
  if (!draft.automatic && !draft.code.trim()) return 'promoCodeRequired'
  if (draft.target === 'products' && !draft.productIds.length) return 'promoPickTargets'
  if (draft.target === 'categories' && !draft.categoryIds.length) return 'promoPickTargets'
  return null
}

// --- Reading an existing promotion back into a draft (edit screen) ----------

export interface ApiRule { attribute: string; operator: string; values: string[] }

export interface ApiPromotion {
  id: string
  code: string | null
  isAutomatic: boolean
  status: string
  type: string
  campaignId: string | null
  applicationMethod: {
    target: string
    allocation: string
    valueType: string
    value: number
    currencyCode: string | null
    buyRulesMinQuantity: number | null
    applyToQuantity: number | null
  } | null
  rules: ApiRule[]
  targetRules: ApiRule[]
  buyRules: ApiRule[]
}

export interface ApiCampaign {
  id: string
  name: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  budget: { id: string; type: string; currencyCode: string | null; limitAmount: number | null; usedAmount: number } | null
  promotions?: { id: string; code: string | null }[]
}

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

export function promotionToDraft(promotion: ApiPromotion, campaign: ApiCampaign | null, fallbackCurrency = 'eur'): PromotionDraft {
  const am = promotion.applicationMethod
  const currency = am?.currencyCode ?? campaign?.budget?.currencyCode ?? fallbackCurrency
  const draft = emptyPromotionDraft(currency)

  draft.kind = promotion.type === 'buyget' ? 'buyget' : am?.valueType === 'fixed' ? 'amount' : 'percent'
  draft.value = draft.kind === 'buyget' ? '' : draft.kind === 'amount' ? minorToAmountInput(am?.value ?? 0, currency) : String(am?.value ?? '')

  const productRule = promotion.targetRules.find((r) => r.attribute === 'product_id')
  const categoryRule = promotion.targetRules.find((r) => r.attribute === 'product_category_id')
  draft.target = am?.target === 'shipping'
    ? 'shipping'
    : productRule
      ? 'products'
      : categoryRule
        ? 'categories'
        : 'order'
  draft.productIds = productRule?.values ?? []
  draft.categoryIds = categoryRule?.values ?? []
  draft.splitAcross = am?.allocation === 'across'
  draft.buyQuantity = String(am?.buyRulesMinQuantity ?? 2)
  draft.getQuantity = String(am?.applyToQuantity ?? 1)

  const minRule = promotion.rules.find((r) => r.attribute === 'cart_subtotal')
  draft.minSubtotal = minRule ? minorToAmountInput(Number(minRule.values[0] ?? 0), currency) : ''
  draft.groupIds = promotion.rules.find((r) => r.attribute === 'customer_group_id')?.values ?? []

  const budget = campaign?.budget ?? null
  draft.budgetKind = budget?.type === 'spend' ? 'spend' : budget?.type === 'usage' ? 'usage' : 'none'
  draft.budgetLimit = budget?.limitAmount === null || budget === null
    ? ''
    : budget.type === 'spend'
      ? minorToAmountInput(budget.limitAmount, currency)
      : String(budget.limitAmount)

  draft.automatic = promotion.isAutomatic
  draft.code = promotion.code ?? ''
  draft.startsAt = dateInput(campaign?.startsAt ?? null)
  draft.endsAt = dateInput(campaign?.endsAt ?? null)

  return draft
}

/** Budget consumption for the list/campaign screens: `null` when uncapped. */
export function budgetProgress(campaign: ApiCampaign | null): { type: 'spend' | 'usage'; used: number; limit: number | null; currency: string } | null {
  const budget = campaign?.budget
  if (!budget || (budget.type !== 'spend' && budget.type !== 'usage')) return null
  return {
    type: budget.type,
    used: budget.usedAmount,
    limit: budget.limitAmount,
    currency: budget.currencyCode ?? 'eur',
  }
}
