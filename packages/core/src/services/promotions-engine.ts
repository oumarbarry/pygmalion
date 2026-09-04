// --- Promotions engine ---
// BuyGet + all budget types are full Medusa v2 parity. This is the PURE
// compute layer feeding `cart-totals.ts`'s `promotions` step (that file's
// header is the frozen pipeline contract, read it first): no I/O, no DB, no
// Date.now() (`now` is an input). Every promotion/campaign/budget row is
// pre-loaded by the caller (`services/promotions.ts`'s candidate loader);
// this file only computes.
import { allocate, sumCents } from '../money'
import type { CartTotalsState } from './cart-totals'

export type PromotionRuleOperator = 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'

export interface EngineRule {
  attribute: string
  operator: PromotionRuleOperator
  values: string[]
}

export interface ApplicationMethodEngineInput {
  target: 'order' | 'items' | 'shipping'
  allocation: 'each' | 'across' | 'once'
  valueType: 'fixed' | 'percentage'
  /** fixed: cents. percentage: whole points 0-100. */
  value: number
  maxQuantity: number | null
  /** BuyGet only. */
  buyRulesMinQuantity: number | null
  applyToQuantity: number | null
  targetRules: EngineRule[]
  buyRules: EngineRule[]
}

export interface CampaignBudgetEngineInput {
  id: string
  type: 'spend' | 'usage' | 'use_by_attribute'
  /** null = unlimited. spend: cents. usage/use_by_attribute: a plain count. */
  limit: number | null
  /**
   * Usage already committed by every OTHER cart/order — the caller is
   * responsible for excluding THIS cart's own previous contribution first
   * (services/promotions.ts's delete+recreate release/commit dance), so this
   * function never needs to know "whose" usage it's looking at.
   */
  usedByOthers: number
  /** use_by_attribute only — which key of `PromotionEligibilityContext.attributeValues` this budget is scoped by. */
  attribute: string | null
  /** use_by_attribute only — `usedByOthers` narrowed to the resolved attribute value for this context. */
  usedByOthersForAttributeValue: number
}

export interface PromotionEngineInput {
  id: string
  code: string | null
  type: 'standard' | 'buyget'
  /** Promotion-level eligibility (AND across rules, OR within one rule's values). */
  rules: EngineRule[]
  application: ApplicationMethodEngineInput
  campaign: { startsAt: Date | null; endsAt: Date | null; budget: CampaignBudgetEngineInput | null } | null
}

export interface ItemAttributeContext {
  productId: string | null
  categoryIds: string[]
  tagIds: string[]
  productTypeId: string | null
}

export interface ShippingAttributeContext {
  shippingOptionId: string | null
}

export interface PromotionEligibilityContext {
  now: Date
  currencyCode: string
  regionId: string | null
  customerGroupIds: string[]
  /** e.g. `{ customer_id: 'cus_1', customer_email: 'a@b.com' }` — a `use_by_attribute` budget's `attribute` picks one key. */
  attributeValues: Record<string, string>
  items: Record<string, ItemAttributeContext>
  shippingMethods: Record<string, ShippingAttributeContext>
}

export interface PromotionAdjustment {
  target: 'item' | 'shipping'
  targetId: string
  promotionId: string
  code: string | null
  description: string
  amount: number
}

export interface BudgetDelta {
  promotionId: string
  budgetId: string
  type: 'spend' | 'usage' | 'use_by_attribute'
  /** spend: cents discounted this call. usage/use_by_attribute: 1 (consumed) or 0. */
  amount: number
  attributeValue: string | null
}

export type RejectionReason = 'inactive_window' | 'ineligible' | 'budget_exceeded' | 'no_target'

export interface ComputeAdjustmentsResult {
  state: CartTotalsState
  adjustments: PromotionAdjustment[]
  budgetDeltas: BudgetDelta[]
  rejected: Array<{ promotionId: string; reason: RejectionReason }>
}

const emptyItemAttrs: ItemAttributeContext = { productId: null, categoryIds: [], tagIds: [], productTypeId: null }
const emptyShippingAttrs: ShippingAttributeContext = { shippingOptionId: null }

// --- Rule evaluation ----------------------------------------------------------
// AND across rules of a group, OR within one rule's `values`. `gt/gte/lt/lte`
// compare numerically against `values[0]`; `eq`/`in` are the same "any of
// actual is in values" test (both already support a multi-value set) — only
// `ne` negates it. A rule whose attribute this engine doesn't know resolves
// to `null` and never matches (safe default, not silently vacuous-true).

function matchRule(rule: EngineRule, actual: string[] | number | null): boolean {
  if (rule.operator === 'gt' || rule.operator === 'gte' || rule.operator === 'lt' || rule.operator === 'lte') {
    if (typeof actual !== 'number') return false
    const expected = Number(rule.values[0])
    if (Number.isNaN(expected)) return false
    switch (rule.operator) {
      case 'gt':
        return actual > expected
      case 'gte':
        return actual >= expected
      case 'lt':
        return actual < expected
      case 'lte':
        return actual <= expected
    }
  }
  const actualSet = actual === null ? [] : Array.isArray(actual) ? actual : [String(actual)]
  const isIn = actualSet.some((a) => rule.values.includes(a))
  return rule.operator === 'ne' ? !isIn : isIn
}

function matchAllRules(rules: EngineRule[], resolve: (attribute: string) => string[] | number | null): boolean {
  return rules.every((r) => matchRule(r, resolve(r.attribute)))
}

// Closed attribute set this engine understands (schema/promotions.ts header —
// `attribute` is free text in the DB, this is where it's actually interpreted).

function resolveEligibilityAttribute(attribute: string, ctx: PromotionEligibilityContext, cartSubtotal: number): string[] | number | null {
  switch (attribute) {
    case 'customer_group_id':
      return ctx.customerGroupIds
    case 'region_id':
      return ctx.regionId ? [ctx.regionId] : []
    case 'currency_code':
      return [ctx.currencyCode]
    case 'cart_subtotal':
      return cartSubtotal
    default:
      return null
  }
}

function resolveItemAttribute(attribute: string, item: ItemAttributeContext, quantity: number): string[] | number | null {
  switch (attribute) {
    case 'product_id':
      return item.productId ? [item.productId] : []
    case 'product_category_id':
      return item.categoryIds
    case 'product_tag_id':
      return item.tagIds
    case 'product_type_id':
      return item.productTypeId ? [item.productTypeId] : []
    case 'item_quantity':
      return quantity
    default:
      return null
  }
}

function resolveShippingAttribute(attribute: string, sm: ShippingAttributeContext): string[] | number | null {
  switch (attribute) {
    case 'shipping_option_id':
      return sm.shippingOptionId ? [sm.shippingOptionId] : []
    default:
      return null
  }
}

// --- Stacking order ---
// BuyGet before standard; within a type, value desc; tie-break by id (stable,
// deterministic). Deliberately skips a finer buyget tie-break on
// buy_rules_min_quantity/apply_to_quantity; add it if two BuyGet promos with
// the exact same `value` ever need a finer stable order.

function sortPromotions(promos: PromotionEngineInput[]): PromotionEngineInput[] {
  return [...promos].sort((a, b) => {
    const aBuy = a.type === 'buyget' ? 0 : 1
    const bBuy = b.type === 'buyget' ? 0 : 1
    if (aBuy !== bBuy) return aBuy - bBuy
    if (a.application.value !== b.application.value) return b.application.value - a.application.value
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// --- Target line abstraction (item and shipping method, unified) -------------

interface TargetLine {
  id: string
  unitPrice: number // items: unit price. shipping: the flat `amount` (quantity 1).
  quantity: number
  subtotal: number // gross, pre-discount (`base`'s output) — remaining = subtotal - already-discounted.
}

function remainingOf(t: TargetLine, discountByLineId: Map<string, number>): number {
  return t.subtotal - (discountByLineId.get(t.id) ?? 0)
}

// --- Standard allocation (each / across / once) ------------------------------

function computeStandardAmounts(app: ApplicationMethodEngineInput, targets: TargetLine[], discountByLineId: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>()
  if (!targets.length) return result

  if (app.allocation === 'across') {
    const weights = targets.map((t) => remainingOf(t, discountByLineId))
    const totalRemaining = sumCents(weights)
    if (totalRemaining <= 0) return result
    let totalRaw = app.valueType === 'percentage' ? Math.round((totalRemaining * app.value) / 100) : app.value
    totalRaw = Math.min(totalRaw, totalRemaining)
    if (totalRaw <= 0) return result
    const shares = allocate(totalRaw, weights)
    targets.forEach((t, i) => {
      if (shares[i] > 0) result.set(t.id, shares[i])
    })
    return result
  }

  if (app.allocation === 'once') {
    const unitCap = app.maxQuantity ?? Infinity
    const units = expandUnits(targets)
    units.sort((a, b) => a.unitPrice - b.unitPrice || (a.id < b.id ? -1 : 1))
    const usedPerLine = new Map<string, number>()
    let count = 0
    for (const u of units) {
      if (count >= unitCap) break
      const line = targets.find((t) => t.id === u.id)!
      const usedSoFar = usedPerLine.get(u.id) ?? 0
      const cap = remainingOf(line, discountByLineId) - usedSoFar
      const perUnit = app.valueType === 'fixed' ? app.value : Math.round((u.unitPrice * app.value) / 100)
      const amt = Math.min(perUnit, Math.max(cap, 0))
      if (amt > 0) {
        result.set(u.id, (result.get(u.id) ?? 0) + amt)
        usedPerLine.set(u.id, usedSoFar + amt)
      }
      count++
    }
    return result
  }

  // 'each': independent per line. fixed = per-unit amount (capped by
  // maxQuantity units); percentage = of the line's own remaining subtotal
  // (percentage deliberately ignores maxQuantity; proration across a partial
  // quantity is BuyGet/`once`'s job, add if a real "percentage off first N
  // units" promo shows up).
  for (const t of targets) {
    const rem = remainingOf(t, discountByLineId)
    if (rem <= 0) continue
    let raw: number
    if (app.valueType === 'fixed') {
      const units = app.maxQuantity ? Math.min(t.quantity, app.maxQuantity) : t.quantity
      raw = app.value * units
    } else {
      raw = Math.round((rem * app.value) / 100)
    }
    raw = Math.min(raw, rem)
    if (raw > 0) result.set(t.id, raw)
  }
  return result
}

function expandUnits(targets: TargetLine[]): Array<{ id: string; unitPrice: number }> {
  const units: Array<{ id: string; unitPrice: number }> = []
  for (const t of targets) {
    for (let i = 0; i < t.quantity; i++) units.push({ id: t.id, unitPrice: t.unitPrice })
  }
  return units
}

// --- BuyGet (full parity) ---
// `cycles = floor(totalBuyEligibleQuantity / buyRulesMinQuantity)` is a
// closed-form division (no unbounded loop; same result as an iterative
// reservation for the non-overlapping-promotion case this engine handles,
// capped defensively anyway). Each cycle offers `applyToQuantity` units,
// discounted on the CHEAPEST eligible target units first (deterministic
// "buy 2 get the cheapest one free" reading).
// Deliberately, buy-eligible and target-eligible pools aren't mutually
// exclusive reservations: a unit can count toward both the "buy" trigger and
// be the "get" target in the same pass. Correct for disjoint buy/target rule sets
// (the common case, and what's tested); add reservation bookkeeping if a
// single-pool "buy 2 get 1 of the same product free" case needs exact-unit
// exclusivity.

function computeBuyGetAmounts(app: ApplicationMethodEngineInput, buyEligible: TargetLine[], targetEligible: TargetLine[], discountByLineId: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>()
  const minQty = app.buyRulesMinQuantity ?? 1
  const applyQty = app.applyToQuantity ?? 1
  if (minQty <= 0 || applyQty <= 0) return result

  const totalBuyQty = buyEligible.reduce((s, t) => s + t.quantity, 0)
  const cycles = Math.min(Math.floor(totalBuyQty / minQty), 1000)
  if (cycles <= 0) return result

  let unitsToDiscount = cycles * applyQty
  if (app.maxQuantity) unitsToDiscount = Math.min(unitsToDiscount, app.maxQuantity)
  if (unitsToDiscount <= 0) return result

  const units = expandUnits(targetEligible)
  units.sort((a, b) => a.unitPrice - b.unitPrice || (a.id < b.id ? -1 : 1))

  const usedPerLine = new Map<string, number>()
  let discounted = 0
  for (const u of units) {
    if (discounted >= unitsToDiscount) break
    const line = targetEligible.find((t) => t.id === u.id)!
    const usedSoFar = usedPerLine.get(u.id) ?? 0
    const cap = remainingOf(line, discountByLineId) - usedSoFar
    const perUnit = app.valueType === 'fixed' ? app.value : Math.round((u.unitPrice * app.value) / 100)
    const amt = Math.min(perUnit, Math.max(cap, 0))
    if (amt > 0) {
      result.set(u.id, (result.get(u.id) ?? 0) + amt)
      usedPerLine.set(u.id, usedSoFar + amt)
    }
    discounted++
  }
  return result
}

// --- Main entry point ----------------------------------------------------------

export function computeAdjustments(state: CartTotalsState, promotionsInput: PromotionEngineInput[], context: PromotionEligibilityContext): ComputeAdjustmentsResult {
  const discountByItemId = new Map(state.items.map((i) => [i.id, i.discountTotal]))
  const discountByShippingId = new Map(state.shippingMethods.map((s) => [s.id, s.discountTotal]))
  const cartSubtotal = sumCents(state.items.map((i) => i.subtotal))

  const itemLines = (): TargetLine[] => state.items.map((i) => ({ id: i.id, unitPrice: i.unitPrice, quantity: i.quantity, subtotal: i.subtotal }))
  const shippingLines = (): TargetLine[] => state.shippingMethods.map((s) => ({ id: s.id, unitPrice: s.amount, quantity: 1, subtotal: s.subtotal }))

  const adjustments: PromotionAdjustment[] = []
  const budgetDeltas: BudgetDelta[] = []
  const rejected: ComputeAdjustmentsResult['rejected'] = []

  // Cumulative consumption THIS call, per budget id — lets several promotions
  // sharing one campaign budget respect each other's consumption in stacking
  // order (each check below reads `usedByOthers` + this running total).
  const spentThisCall = new Map<string, number>()
  const usageThisCall = new Map<string, number>()

  for (const promo of sortPromotions(promotionsInput)) {
    const campaign = promo.campaign
    if (campaign?.startsAt && context.now < campaign.startsAt) {
      rejected.push({ promotionId: promo.id, reason: 'inactive_window' })
      continue
    }
    if (campaign?.endsAt && context.now > campaign.endsAt) {
      rejected.push({ promotionId: promo.id, reason: 'inactive_window' })
      continue
    }

    if (!matchAllRules(promo.rules, (attr) => resolveEligibilityAttribute(attr, context, cartSubtotal))) {
      rejected.push({ promotionId: promo.id, reason: 'ineligible' })
      continue
    }

    const budget = campaign?.budget ?? null
    // usage/use_by_attribute: count-based, checkable before computing amounts.
    if (budget && budget.type !== 'spend') {
      const already = (budget.type === 'usage' ? budget.usedByOthers : budget.usedByOthersForAttributeValue) + (usageThisCall.get(budget.id) ?? 0)
      if (budget.limit !== null && already + 1 > budget.limit) {
        rejected.push({ promotionId: promo.id, reason: 'budget_exceeded' })
        continue
      }
    }

    const app = promo.application
    let kind: 'item' | 'shipping'
    let amounts: Map<string, number>

    if (app.target === 'shipping') {
      kind = 'shipping'
      const resolveSm = (t: TargetLine) => context.shippingMethods[t.id] ?? emptyShippingAttrs
      const targets = shippingLines().filter((t) => matchAllRules(app.targetRules, (attr) => resolveShippingAttribute(attr, resolveSm(t))))
      amounts =
        promo.type === 'buyget'
          ? computeBuyGetAmounts(
              app,
              shippingLines().filter((t) => matchAllRules(app.buyRules, (attr) => resolveShippingAttribute(attr, resolveSm(t)))),
              targets,
              discountByShippingId,
            )
          : computeStandardAmounts(app, targets, discountByShippingId)
    } else {
      kind = 'item'
      const allItems = itemLines()
      const resolveItem = (t: TargetLine) => context.items[t.id] ?? emptyItemAttrs
      const targets =
        app.target === 'order' ? allItems : allItems.filter((t) => matchAllRules(app.targetRules, (attr) => resolveItemAttribute(attr, resolveItem(t), t.quantity)))
      amounts =
        promo.type === 'buyget'
          ? computeBuyGetAmounts(
              app,
              allItems.filter((t) => matchAllRules(app.buyRules, (attr) => resolveItemAttribute(attr, resolveItem(t), t.quantity))),
              targets,
              discountByItemId,
            )
          : computeStandardAmounts(app, targets, discountByItemId)
    }

    const totalAmount = sumCents([...amounts.values()])
    if (totalAmount <= 0) {
      rejected.push({ promotionId: promo.id, reason: 'no_target' })
      continue
    }

    if (budget?.type === 'spend') {
      const already = budget.usedByOthers + (spentThisCall.get(budget.id) ?? 0)
      if (budget.limit !== null && already + totalAmount > budget.limit) {
        rejected.push({ promotionId: promo.id, reason: 'budget_exceeded' })
        continue
      }
    }

    const discountMap = kind === 'item' ? discountByItemId : discountByShippingId
    for (const [lineId, amt] of amounts) {
      discountMap.set(lineId, (discountMap.get(lineId) ?? 0) + amt)
      adjustments.push({
        target: kind,
        targetId: lineId,
        promotionId: promo.id,
        code: promo.code,
        description: promo.code ? `Promotion ${promo.code}` : `Promotion ${promo.id}`,
        amount: amt,
      })
    }

    if (budget) {
      if (budget.type === 'spend') {
        spentThisCall.set(budget.id, (spentThisCall.get(budget.id) ?? 0) + totalAmount)
        budgetDeltas.push({ promotionId: promo.id, budgetId: budget.id, type: 'spend', amount: totalAmount, attributeValue: null })
      } else {
        usageThisCall.set(budget.id, (usageThisCall.get(budget.id) ?? 0) + 1)
        const attributeValue = budget.type === 'use_by_attribute' && budget.attribute ? (context.attributeValues[budget.attribute] ?? null) : null
        budgetDeltas.push({ promotionId: promo.id, budgetId: budget.id, type: budget.type, amount: 1, attributeValue })
      }
    }
  }

  const newState: CartTotalsState = {
    ...state,
    items: state.items.map((i) => ({ ...i, discountTotal: discountByItemId.get(i.id) ?? i.discountTotal })),
    shippingMethods: state.shippingMethods.map((s) => ({ ...s, discountTotal: discountByShippingId.get(s.id) ?? s.discountTotal })),
  }

  return { state: newState, adjustments, budgetDeltas, rejected }
}
