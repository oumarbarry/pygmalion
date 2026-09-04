// Cart totals pipeline. This comment block IS the frozen contract the
// promotions engine builds against; read it before touching `promotions`
// below.
//
// Totals are PERSISTED (cents columns on cart/line-items/shipping-methods,
// `schema/cart.ts`), never recomputed at read time. `services/cart.ts` runs
// `runCartTotalsPipeline` once per mutation, inside the same transaction, and
// writes every field of the resulting `CartTotalsState` back to its owning row.
//
// Five steps, `(state) => state` (or `Promise<state>` for the one step that
// needs a DB/provider call, `tax`): `base -> promotions -> shipping -> tax
// -> sum`. Each is independently unit-testable in isolation: "amount after
// discount" and "amount after tax" are two dedicated steps instead of one
// tangled per-item function.
//
// Per-line formula (integer cents; identical shape for tax-inclusive AND
// tax-exclusive, only `subtotal` differs):
//   grossTotal   = unitPrice * quantity                (or `amount` for a shipping method)
//   subtotal     = isTaxInclusive ? round(grossTotal / (1 + Σrate/100)) : grossTotal
//   taxableAmount = subtotal - discountTotal
//   taxTotal     = Σ round(taxableAmount * rate/100)    (one term per matching tax line)
//   total        = taxableAmount + taxTotal
//
// --- `promotions` step interface (FROZEN) -----------------------------------
// The engine (`computeAdjustments(state, promotions) -> state`) MUST keep
// this contract:
//   - Signature: `(state: CartTotalsState) => CartTotalsState` (sync — a
//     promotion's own eligibility/rule data should already be loaded by the
//     caller before invoking the pipeline; this step itself does no I/O).
//     Never mutates `state` or its arrays in place — always returns a new
//     state with new `items`/`shippingMethods` arrays (same convention as
//     every other step here).
//   - The ONLY field it may write per item/shipping-method at this stage is
//     `discountTotal` (cents, integer, >= 0, and <= that line's `subtotal`
//     i.e. `base`'s `unitPrice*quantity` for items / `amount` for shipping —
//     a total can never go negative). `subtotal`/`taxTotal`/`total` are
//     recomputed by the `tax`/`sum` steps that run after it — writing them
//     here is silently discarded.
//   - Ordering: `promotions` runs BEFORE `shipping` and `tax`. It sees
//     `items` already `base`'d (their `subtotal`/`total` = grossTotal) but
//     `shippingMethods` are only `base`'d too (their `subtotal`/`total` =
//     `amount`) — no tax has been resolved yet at this point, for either.
///    Stacking multiple promotions in one call MUST apply them in a
//     deterministic order and compute each one's amount against the
//     *remaining* (already-discounted-by-earlier-promotions) `subtotal`,
//     never against the original gross amount (each promotion computes on
//     the remaining amount, never the original).
//   - Any amount split across N target lines (allocation `across`, or a flat
//     promo value spread over several eligible lines) MUST use
//     `money.allocate` (largest-remainder) so cents are never lost or
//     invented.
import { sumCents } from '../money'
// --- Promotions: the frozen step below delegates here. ---------------------
import { computeAdjustments, type PromotionEligibilityContext, type PromotionEngineInput } from './promotions-engine'
import type { TaxAddress, TaxCalculationContext, TaxCalculationItem, TaxLine } from './tax'

// --- State shape --------------------------------------------------------------

export interface CartTotalsLineInput {
  id: string
  /** Used to build the `TaxCalculationItem` for this line — `null` skips tax resolution for it (e.g. a snapshot whose product was later deleted). */
  productId: string | null
  productTypeId?: string | null
  unitPrice: number
  quantity: number
  isTaxInclusive: boolean
}

export interface CartTotalsShippingInput {
  id: string
  /** Same role as `CartTotalsLineInput.productId`, targeting the `shipping_option` reference instead. */
  shippingOptionId: string | null
  amount: number
  isTaxInclusive: boolean
}

export interface TaxLineTotal {
  rateId: string | null
  code: string
  name: string
  rate: number
  providerId: string
  /** This tax line's own share of the owning line's `taxTotal`, cents. */
  amount: number
}

interface Computed {
  subtotal: number
  discountTotal: number
  taxTotal: number
  taxLines: TaxLineTotal[]
  total: number
}

export type CartTotalsLine = CartTotalsLineInput & Computed
export type CartTotalsShippingLine = CartTotalsShippingInput & Computed

export interface CartTotalsState {
  currencyCode: string
  /** `null` -> no tax is resolved (no address = no tax, not an error). */
  address: TaxAddress | null
  items: CartTotalsLine[]
  shippingMethods: CartTotalsShippingLine[]
  // Cart-level totals (cents) — written by `sum`.
  itemsSubtotal: number
  shippingTotal: number
  discountTotal: number
  taxTotal: number
  total: number
}

const zeroComputed: Computed = { subtotal: 0, discountTotal: 0, taxTotal: 0, taxLines: [], total: 0 }

/** Builds the initial pipeline input — every computed field zeroed, filled in by `base`/`shipping`/`tax`/`sum`. */
export function initCartTotalsState(input: {
  currencyCode: string
  address: TaxAddress | null
  items: CartTotalsLineInput[]
  shippingMethods: CartTotalsShippingInput[]
}): CartTotalsState {
  return {
    currencyCode: input.currencyCode,
    address: input.address,
    items: input.items.map((li) => ({ ...li, ...zeroComputed })),
    shippingMethods: input.shippingMethods.map((sm) => ({ ...sm, ...zeroComputed })),
    itemsSubtotal: 0,
    shippingTotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    total: 0,
  }
}

// --- Step 1: base -------------------------------------------------------------
// Raw pre-adjustment amount for every line: `unitPrice * quantity` for items,
// the flat `amount` for shipping methods (no quantity). `subtotal`/`total`
// start out equal to this gross figure; `tax` overwrites both once rates are
// known (and — for a line with no matching tax at all — `tax` naturally
// leaves them at this same gross value, no special-casing needed).

export function base(state: CartTotalsState): CartTotalsState {
  return {
    ...state,
    items: state.items.map((li) => {
      const gross = li.unitPrice * li.quantity
      return { ...li, subtotal: gross, total: gross }
    }),
    shippingMethods: state.shippingMethods.map((sm) => ({ ...sm, subtotal: sm.amount, total: sm.amount })),
  }
}

// --- Step 2: promotions (frozen interface, see file header) ------------------
// Real engine (`services/promotions-engine.ts::computeAdjustments`), still
// sync/pure/no-I/O per the frozen contract above: `deps` is optional
// (undefined/empty -> identity) and every promotion/rule/budget row plus the
// eligibility context it needs is already resolved by the caller
// (`services/cart.ts`'s `recalc`) before this runs.

export interface PromotionsStepDeps {
  promotions: PromotionEngineInput[]
  context: PromotionEligibilityContext
}

export function promotions(state: CartTotalsState, deps?: PromotionsStepDeps): CartTotalsState {
  if (!deps || deps.promotions.length === 0) return state
  return computeAdjustments(state, deps.promotions, deps.context).state
}

// --- Step 3: shipping -----------------------------------------------------------
// Identity for now: `base` already folds `shippingMethods` in (their
// `amount` needs no computation, unlike an item's `unitPrice * quantity`).
// Kept as its own pipeline stage (rather than merged into `base`) for
// single responsibility and unit-testability, and as the extension point a
// later feature may need (e.g. a `calculated` price_type shipping option
// recomputed at totals time).

export function shipping(state: CartTotalsState): CartTotalsState {
  return state
}

// --- Step 4: tax ----------------------------------------------------------------

export interface TaxStepDeps {
  taxService: { getTaxLines(items: TaxCalculationItem[], context: TaxCalculationContext): Promise<TaxLine[]> }
  customer?: TaxCalculationContext['customer']
}

function computeLineTax<T extends { subtotal: number; discountTotal: number; isTaxInclusive: boolean }>(
  line: T,
  rates: TaxLineTotal[],
): T {
  const grossTotal = line.subtotal // set by `base`/`shipping`: unitPrice*qty or amount
  const sumRatePct = sumCents(rates.map((r) => r.rate))
  const subtotal = line.isTaxInclusive ? Math.round((grossTotal * 100) / (100 + sumRatePct)) : grossTotal
  const taxableAmount = subtotal - line.discountTotal
  const taxLines = rates.map((r) => ({ ...r, amount: Math.round((taxableAmount * r.rate) / 100) }))
  const taxTotal = sumCents(taxLines.map((t) => t.amount))
  const total = taxableAmount + taxTotal
  return { ...line, subtotal, taxTotal, taxLines, total }
}

export async function tax(state: CartTotalsState, deps: TaxStepDeps): Promise<CartTotalsState> {
  const ratesById = new Map<string, TaxLineTotal[]>()
  if (state.address) {
    const calcItems: TaxCalculationItem[] = [
      ...state.items
        .filter((li) => li.productId)
        .map((li) => ({ id: li.id, reference: 'product', referenceId: li.productId!, productTypeId: li.productTypeId })),
      ...state.shippingMethods
        .filter((sm) => sm.shippingOptionId)
        .map((sm) => ({ id: sm.id, reference: 'shipping_option', referenceId: sm.shippingOptionId! })),
    ]
    if (calcItems.length) {
      const lines = await deps.taxService.getTaxLines(calcItems, { address: state.address, customer: deps.customer })
      for (const l of lines) {
        const arr = ratesById.get(l.itemId) ?? []
        arr.push({ rateId: l.rateId, code: l.code, name: l.name, rate: l.rate, providerId: l.providerId, amount: 0 })
        ratesById.set(l.itemId, arr)
      }
    }
  }

  return {
    ...state,
    items: state.items.map((li) => computeLineTax(li, ratesById.get(li.id) ?? [])),
    shippingMethods: state.shippingMethods.map((sm) => computeLineTax(sm, ratesById.get(sm.id) ?? [])),
  }
}

// --- Step 5: sum ----------------------------------------------------------------
// Identity that always holds (verified in tests):
//   total === itemsSubtotal + shippingTotal - discountTotal + taxTotal

export function sum(state: CartTotalsState): CartTotalsState {
  const itemsSubtotal = sumCents(state.items.map((i) => i.subtotal))
  const shippingTotal = sumCents(state.shippingMethods.map((s) => s.subtotal))
  const discountTotal = sumCents([...state.items, ...state.shippingMethods].map((l) => l.discountTotal))
  const taxTotal = sumCents([...state.items, ...state.shippingMethods].map((l) => l.taxTotal))
  const total = sumCents([...state.items, ...state.shippingMethods].map((l) => l.total))
  return { ...state, itemsSubtotal, shippingTotal, discountTotal, taxTotal, total }
}

// --- Orchestrator ---------------------------------------------------------------

export async function runCartTotalsPipeline(state: CartTotalsState, deps: TaxStepDeps): Promise<CartTotalsState> {
  let s = base(state)
  s = promotions(s)
  s = shipping(s)
  s = await tax(s, deps)
  s = sum(s)
  return s
}
