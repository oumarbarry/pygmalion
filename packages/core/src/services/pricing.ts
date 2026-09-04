import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { priceListRules, priceLists, priceRules, prices, type Price, type PriceList, type PriceRule } from '../schema/pricing'
import { pricePreferences } from '../schema/settings'
import {
  batchPricesInput,
  createPriceInput,
  createPriceListInput,
  priceListProductsInput,
  updatePriceInput,
  updatePriceListInput,
  type BatchPricesInput,
  type CreatePriceInput,
  type CreatePriceListInput,
  type PriceListProductsInput,
  type UpdatePriceInput,
  type UpdatePriceListInput,
} from '../validation/pricing'
import type { ServiceContext } from './context'

/**
 * `calculatePrices` signature the cart consumes: pass the variant (or
 * shipping-option) ids on the line items plus this context. `currencyCode`
 * is required (`INVALID_DATA` otherwise); everything else is
 * optional and simply narrows the matching rules that can fire.
 */
export interface PricingContext {
  currencyCode: string
  regionId?: string
  customerGroupIds?: string[]
  quantity?: number
}

export interface CalculatedPrice {
  id: string
  currencyCode: string
  calculatedAmount: number | null
  originalAmount: number | null
  calculatedPriceId: string | null
  originalPriceId: string | null
  isCalculatedPriceTaxInclusive: boolean
  isOriginalPriceTaxInclusive: boolean
  priceListId: string | null
  priceListType: 'sale' | 'override' | null
}

export interface ListPriceListsOptions {
  limit?: number
  offset?: number
}

export interface ListPricesOptions {
  limit?: number
  offset?: number
}

// --- Rule matching (strict AND, implemented as semantics not SQL) ------------

function compareValue(actual: string, operator: PriceRule['operator'], expected: string): boolean {
  if (operator === 'eq') return actual === expected
  const a = Number(actual)
  const b = Number(expected)
  switch (operator) {
    case 'gt':
      return a > b
    case 'gte':
      return a >= b
    case 'lt':
      return a < b
    case 'lte':
      return a <= b
    default:
      return false
  }
}

function priceRuleMatches(rule: PriceRule, context: PricingContext): boolean {
  if (rule.attribute === 'region_id') {
    return context.regionId !== undefined && compareValue(context.regionId, rule.operator, rule.value)
  }
  if (rule.attribute === 'currency_code') {
    return compareValue(context.currencyCode, rule.operator, rule.value)
  }
  // customer_group_id: context carries every group the customer belongs to —
  // matches if any of them satisfies the rule.
  return (context.customerGroupIds ?? []).some((g) => compareValue(g, rule.operator, rule.value))
}

function listRuleMatches(rule: { attribute: string; value: string[] }, context: PricingContext): boolean {
  if (rule.attribute === 'region_id') {
    return context.regionId !== undefined && rule.value.includes(context.regionId)
  }
  if (rule.attribute === 'currency_code') {
    return rule.value.includes(context.currencyCode)
  }
  return (context.customerGroupIds ?? []).some((g) => rule.value.includes(g))
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = map.get(k)
    if (bucket) bucket.push(row)
    else map.set(k, [row])
  }
  return map
}

function emptyCalculatedPrice(id: string, currencyCode: string): CalculatedPrice {
  return {
    id,
    currencyCode,
    calculatedAmount: null,
    originalAmount: null,
    calculatedPriceId: null,
    originalPriceId: null,
    isCalculatedPriceTaxInclusive: false,
    isOriginalPriceTaxInclusive: false,
    priceListId: null,
    priceListType: null,
  }
}

export function createPricingService(ctx: ServiceContext) {
  // --- calculatePrices (the core logic) --------------------------------------

  async function calculatePrices(
    ids: string[],
    context: PricingContext,
    opts: { entity?: 'variant' | 'shipping_option' } = {},
  ): Promise<Map<string, CalculatedPrice>> {
    if (!context.currencyCode) {
      throw new Error('calculatePrices: context.currencyCode is required')
    }
    const entity = opts.entity ?? 'variant'
    const currencyCode = context.currencyCode.toLowerCase()
    const result = new Map<string, CalculatedPrice>(ids.map((id) => [id, emptyCalculatedPrice(id, currencyCode)]))
    if (!ids.length) return result

    const ownerColumn = entity === 'variant' ? prices.variantId : prices.shippingOptionId
    const rows = await ctx.db
      .select()
      .from(prices)
      .where(and(inArray(ownerColumn, ids), eq(prices.currencyCode, currencyCode), isNull(prices.deletedAt)))

    // Quantity window: bounds null = unlimited; no
    // `quantity` in context = only the "starts at 1" default tier is visible.
    const qtyFiltered = rows.filter((p) => {
      if (context.quantity !== undefined) {
        if (p.minQuantity !== null && p.minQuantity > context.quantity) return false
        if (p.maxQuantity !== null && p.maxQuantity < context.quantity) return false
        return true
      }
      return p.minQuantity === null || p.minQuantity <= 1
    })
    if (!qtyFiltered.length) return result

    // Price-list window (step 3): inactive/expired/future list -> its prices
    // are invisible, silently falling back to the default price.
    const listIds = [...new Set(qtyFiltered.map((p) => p.priceListId).filter((id): id is string => id !== null))]
    const lists = listIds.length ? await ctx.db.select().from(priceLists).where(inArray(priceLists.id, listIds)) : []
    const listById = new Map(lists.map((l) => [l.id, l]))
    const now = new Date()
    const windowFiltered = qtyFiltered.filter((p) => {
      if (!p.priceListId) return true
      const list = listById.get(p.priceListId)
      if (!list || list.deletedAt || list.status !== 'active') return false
      if (list.startsAt && list.startsAt > now) return false
      if (list.endsAt && list.endsAt < now) return false
      return true
    })
    if (!windowFiltered.length) return result

    // Rule matching (step 4, ET strict): a price/list is retained only if
    // EVERY one of its rules matches (matchedCount === rulesCount; 0 rules =
    // always retained, no partial/best-effort matching).
    const priceIds = windowFiltered.map((p) => p.id)
    const rules = priceIds.length ? await ctx.db.select().from(priceRules).where(inArray(priceRules.priceId, priceIds)) : []
    const rulesByPriceId = groupBy(rules, (r) => r.priceId)

    const listRuleRows = listIds.length
      ? await ctx.db.select().from(priceListRules).where(inArray(priceListRules.priceListId, listIds))
      : []
    const listRulesByListId = groupBy(listRuleRows, (r) => r.priceListId)

    const matched = windowFiltered.filter((p) => {
      const pRules = rulesByPriceId.get(p.id) ?? []
      const matchedCount = pRules.filter((r) => priceRuleMatches(r, context)).length
      if (matchedCount !== p.rulesCount) return false
      if (p.priceListId) {
        const list = listById.get(p.priceListId)!
        const lRules = listRulesByListId.get(p.priceListId) ?? []
        const lMatchedCount = lRules.filter((r) => listRuleMatches(r, context)).length
        if (lMatchedCount !== list.rulesCount) return false
      }
      return true
    })

    // Tax preferences — region > currency (fetched once, reused per id).
    const prefRows =
      context.regionId
        ? await ctx.db
            .select()
            .from(pricePreferences)
            .where(
              and(
                isNull(pricePreferences.deletedAt),
                inArray(pricePreferences.attribute, ['region_id', 'currency_code']),
              ),
            )
        : await ctx.db
            .select()
            .from(pricePreferences)
            .where(and(isNull(pricePreferences.deletedAt), eq(pricePreferences.attribute, 'currency_code')))

    function isTaxInclusive(row: Price): boolean {
      const rowRules = rulesByPriceId.get(row.id) ?? []
      const hasRegionRule =
        context.regionId !== undefined &&
        rowRules.some((r) => r.attribute === 'region_id' && r.operator === 'eq' && r.value === context.regionId)
      if (hasRegionRule) {
        const pref = prefRows.find((p) => p.attribute === 'region_id' && p.value === context.regionId)
        if (pref) return pref.isTaxInclusive
      }
      const currencyPref = prefRows.find((p) => p.attribute === 'currency_code' && p.value === currencyCode)
      return currencyPref ? currencyPref.isTaxInclusive : false
    }

    // Group by owner id, then apply the precedence rules.
    for (const id of ids) {
      const candidates = matched.filter((p) => (entity === 'variant' ? p.variantId : p.shippingOptionId) === id)
      if (!candidates.length) continue

      // ORDER BY price_list_id IS NOT NULL DESC, (rulesCount + list.rulesCount) DESC, amount ASC.
      candidates.sort((a, b) => {
        const aList = a.priceListId ? 1 : 0
        const bList = b.priceListId ? 1 : 0
        if (aList !== bList) return bList - aList
        const aScore = a.rulesCount + (a.priceListId ? listById.get(a.priceListId)!.rulesCount : 0)
        const bScore = b.rulesCount + (b.priceListId ? listById.get(b.priceListId)!.rulesCount : 0)
        if (aScore !== bScore) return bScore - aScore
        return a.amount - b.amount
      })

      const defaultPrice = candidates.find((p) => !p.priceListId) ?? null
      const priceListPrice = candidates.find((p) => p.priceListId) ?? null

      let calculatedPrice: Price | null
      let originalPrice: Price | null
      let listType: 'sale' | 'override' | null = null

      if (!priceListPrice) {
        calculatedPrice = defaultPrice
        originalPrice = defaultPrice
      } else {
        listType = listById.get(priceListPrice.priceListId!)!.type
        if (listType === 'override') {
          calculatedPrice = priceListPrice
          originalPrice = priceListPrice
        } else {
          // sale: default may "win" against a badly-configured/higher sale.
          calculatedPrice = !defaultPrice || priceListPrice.amount <= defaultPrice.amount ? priceListPrice : defaultPrice
          // Never clobber original_price: the strikethrough price is defaultPrice,
          // unless an active OVERRIDE exists elsewhere among the candidates, in
          // which case the strikethrough price becomes that OVERRIDE.
          const overrideElsewhere = candidates.find(
            (p) => p.priceListId && listById.get(p.priceListId)!.type === 'override',
          )
          originalPrice = overrideElsewhere ?? defaultPrice
        }
      }

      result.set(id, {
        id,
        currencyCode,
        calculatedAmount: calculatedPrice?.amount ?? null,
        originalAmount: originalPrice?.amount ?? null,
        calculatedPriceId: calculatedPrice?.id ?? null,
        originalPriceId: originalPrice?.id ?? null,
        isCalculatedPriceTaxInclusive: calculatedPrice ? isTaxInclusive(calculatedPrice) : false,
        isOriginalPriceTaxInclusive: originalPrice ? isTaxInclusive(originalPrice) : false,
        priceListId: priceListPrice?.priceListId ?? null,
        priceListType: listType,
      })
    }

    return result
  }

  // --- Price CRUD (batch — admin routes) --------------------------------------

  async function createPriceRow(tx: ServiceContext['db'], input: CreatePriceInput, forcePriceListId?: string) {
    const data = createPriceInput.parse(input)
    const rules = data.rules ?? []
    const [row] = await tx
      .insert(prices)
      .values({
        id: pygId('price'),
        title: data.title ?? null,
        variantId: data.variantId ?? null,
        shippingOptionId: data.shippingOptionId ?? null,
        currencyCode: data.currencyCode,
        amount: data.amount,
        minQuantity: data.minQuantity ?? null,
        maxQuantity: data.maxQuantity ?? null,
        priceListId: forcePriceListId ?? data.priceListId ?? null,
        rulesCount: rules.length,
      })
      .returning()
    if (rules.length) {
      await tx.insert(priceRules).values(
        rules.map((r) => ({ id: pygId('prule'), priceId: row.id, attribute: r.attribute, value: r.value, operator: r.operator ?? 'eq' })),
      )
    }
    return row
  }

  async function updatePriceRow(tx: ServiceContext['db'], id: string, input: UpdatePriceInput, scopeToPriceListId?: string) {
    const data = updatePriceInput.parse(input)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (data.title !== undefined) set.title = data.title
    if (data.amount !== undefined) set.amount = data.amount
    if (data.minQuantity !== undefined) set.minQuantity = data.minQuantity
    if (data.maxQuantity !== undefined) set.maxQuantity = data.maxQuantity
    if (data.rules !== undefined) set.rulesCount = data.rules.length
    const [row] = await tx
      .update(prices)
      .set(set)
      .where(
        and(
          eq(prices.id, id),
          isNull(prices.deletedAt),
          scopeToPriceListId ? eq(prices.priceListId, scopeToPriceListId) : undefined,
        ),
      )
      .returning()
    if (!row) return null
    if (data.rules !== undefined) {
      await tx.delete(priceRules).where(eq(priceRules.priceId, id))
      if (data.rules.length) {
        await tx
          .insert(priceRules)
          .values(data.rules.map((r) => ({ id: pygId('prule'), priceId: id, attribute: r.attribute, value: r.value, operator: r.operator ?? 'eq' })))
      }
    }
    return row
  }

  async function batchPrices(input: BatchPricesInput, opts: { forcePriceListId?: string } = {}) {
    const data = batchPricesInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const created = []
      for (const c of data.create ?? []) {
        created.push(await createPriceRow(tx, c, opts.forcePriceListId))
      }
      const updated = []
      for (const u of data.update ?? []) {
        const { id, ...rest } = u
        const row = await updatePriceRow(tx, id, rest, opts.forcePriceListId)
        if (row) updated.push(row)
      }
      const deletedIds = data.delete ?? []
      if (deletedIds.length) {
        await tx
          .update(prices)
          .set({ deletedAt: new Date() })
          .where(
            and(
              inArray(prices.id, deletedIds),
              opts.forcePriceListId ? eq(prices.priceListId, opts.forcePriceListId) : undefined,
            ),
          )
      }
      await emitDomainEvent(tx, 'price.batch-updated', {
        created: created.map((r) => r.id),
        updated: updated.map((r) => r.id),
        deleted: deletedIds,
      })
      return { created, updated, deleted: deletedIds }
    })
  }

  // --- PriceList CRUD ----------------------------------------------------------

  async function getPriceList(id: string) {
    const [row] = await ctx.db
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.id, id), isNull(priceLists.deletedAt)))
      .limit(1)
    return row ?? null
  }

  return {
    calculatePrices,
    batchPrices,

    /** Raw price rows of a variant: default prices
     * first (no price list), then list-scoped ones; the admin edits in place
     * instead of stacking duplicates. */
    async listByVariant(variantId: string) {
      return ctx.db
        .select()
        .from(prices)
        .where(and(eq(prices.variantId, variantId), isNull(prices.deletedAt)))
        .orderBy(asc(prices.priceListId), asc(prices.currencyCode), asc(prices.id))
    },

    async listPriceLists({ limit = 20, offset = 0 }: ListPriceListsOptions = {}) {
      return ctx.db
        .select()
        .from(priceLists)
        .where(isNull(priceLists.deletedAt))
        .orderBy(priceLists.createdAt)
        .limit(limit)
        .offset(offset)
    },

    getPriceList,

    async createPriceList(input: CreatePriceListInput) {
      const data = createPriceListInput.parse(input)
      const rules = data.rules ?? []
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(priceLists)
          .values({
            id: pygId('plist'),
            title: data.title,
            description: data.description ?? null,
            status: data.status ?? 'draft',
            type: data.type ?? 'sale',
            startsAt: data.startsAt ?? null,
            endsAt: data.endsAt ?? null,
            metadata: data.metadata ?? null,
            rulesCount: rules.length,
          })
          .returning()
        if (rules.length) {
          await tx.insert(priceListRules).values(rules.map((r) => ({ id: pygId('prule'), priceListId: row.id, attribute: r.attribute, value: r.value })))
        }
        await emitDomainEvent(tx, 'price-list.created', { id: row.id })
        return row
      })
    },

    async updatePriceList(id: string, input: UpdatePriceListInput) {
      const data = updatePriceListInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const set: Record<string, unknown> = { updatedAt: new Date() }
        if (data.title !== undefined) set.title = data.title
        if (data.description !== undefined) set.description = data.description
        if (data.status !== undefined) set.status = data.status
        if (data.type !== undefined) set.type = data.type
        if (data.startsAt !== undefined) set.startsAt = data.startsAt
        if (data.endsAt !== undefined) set.endsAt = data.endsAt
        if (data.metadata !== undefined) set.metadata = data.metadata
        if (data.rules !== undefined) set.rulesCount = data.rules.length
        const [row] = await tx
          .update(priceLists)
          .set(set)
          .where(and(eq(priceLists.id, id), isNull(priceLists.deletedAt)))
          .returning()
        if (!row) return null
        if (data.rules !== undefined) {
          await tx.delete(priceListRules).where(eq(priceListRules.priceListId, id))
          if (data.rules.length) {
            await tx
              .insert(priceListRules)
              .values(data.rules.map((r) => ({ id: pygId('prule'), priceListId: id, attribute: r.attribute, value: r.value })))
          }
        }
        await emitDomainEvent(tx, 'price-list.updated', { id: row.id })
        return row
      })
    },

    async removePriceList(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(priceLists)
          .set({ deletedAt: new Date() })
          .where(and(eq(priceLists.id, id), isNull(priceLists.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'price-list.deleted', { id: row.id })
        return row
      })
    },

    async listPrices(priceListId: string, { limit = 50, offset = 0 }: ListPricesOptions = {}) {
      return ctx.db
        .select()
        .from(prices)
        .where(and(eq(prices.priceListId, priceListId), isNull(prices.deletedAt)))
        .orderBy(prices.createdAt)
        .limit(limit)
        .offset(offset)
    },

    /** POST /price-lists/:id/products: thin wrapper over batchPrices, list forced. */
    async addProductsToList(priceListId: string, input: PriceListProductsInput) {
      const data = priceListProductsInput.parse(input)
      return batchPrices({ create: data.prices.map((p) => ({ ...p, priceListId })) }, { forcePriceListId: priceListId })
    },
  }
}

export type PricingService = ReturnType<typeof createPricingService>
