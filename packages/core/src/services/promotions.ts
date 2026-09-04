// --- Promotions ---
// Admin CRUD (promotions/campaigns/budgets) + the cart-facing candidate
// loader/committer (`applyCartPromotions`) that `services/cart.ts::recalc`
// calls to branch the pipeline's `promotions` step (cart-totals.ts header).
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import {
  campaignBudgetUsages,
  campaignBudgets,
  campaigns,
  promotionApplicationMethods,
  promotionRuleValues,
  promotionRules,
  promotions,
  type Campaign,
  type CampaignBudget,
  type Promotion,
  type PromotionApplicationMethod,
} from '../schema/promotions'
import { cartLineItemAdjustments, cartShippingMethodAdjustments } from '../schema/cart'
import { productCategoryProduct, productTagProduct } from '../schema/taxonomy'
import type { CartTotalsState } from './cart-totals'
import {
  computeAdjustments,
  type EngineRule,
  type ItemAttributeContext,
  type PromotionEngineInput,
} from './promotions-engine'
import {
  campaignPromotionsInput,
  createCampaignInput,
  createPromotionInput,
  promotionRulesBatchInput,
  updateCampaignInput,
  updatePromotionInput,
  type CampaignPromotionsInput,
  type CreateCampaignInput,
  type CreatePromotionInput,
  type PromotionRulesBatchInput,
  type RuleInput,
  type UpdateCampaignInput,
  type UpdatePromotionInput,
} from '../validation/promotions'
import type { ServiceContext } from './context'
import type { PygmalionDatabase } from '../db/types'

// --- Rule attribute catalog (admin UI rule-attribute-options) ---
// Static: matches the closed set `promotions-engine.ts` actually resolves.

const ELIGIBILITY_ATTRIBUTES = ['customer_group_id', 'region_id', 'currency_code', 'cart_subtotal']
const ITEM_ATTRIBUTES = ['product_id', 'product_category_id', 'product_tag_id', 'item_quantity']
const SHIPPING_ATTRIBUTES = ['shipping_option_id']

export type RuleType = 'rules' | 'target-rules' | 'buy-rules'

export function ruleAttributeOptions(ruleType: RuleType, target: 'items' | 'shipping' | 'order' = 'items'): string[] {
  if (ruleType === 'rules') return ELIGIBILITY_ATTRIBUTES
  return target === 'shipping' ? SHIPPING_ATTRIBUTES : ITEM_ATTRIBUTES
}

// --- Nested read helpers -------------------------------------------------------

async function loadRules(db: PygmalionDatabase, promotionIds: string[]) {
  if (!promotionIds.length) return { rulesByPromotionId: new Map<string, Array<typeof promotionRules.$inferSelect & { values: string[] }>>() }
  const ruleRows = await db.select().from(promotionRules).where(inArray(promotionRules.promotionId, promotionIds))
  const ruleIds = ruleRows.map((r) => r.id)
  const valueRows = ruleIds.length ? await db.select().from(promotionRuleValues).where(inArray(promotionRuleValues.ruleId, ruleIds)) : []
  const valuesByRuleId = new Map<string, string[]>()
  for (const v of valueRows) {
    const arr = valuesByRuleId.get(v.ruleId) ?? []
    arr.push(v.value)
    valuesByRuleId.set(v.ruleId, arr)
  }
  const rulesByPromotionId = new Map<string, Array<typeof promotionRules.$inferSelect & { values: string[] }>>()
  for (const r of ruleRows) {
    const arr = rulesByPromotionId.get(r.promotionId) ?? []
    arr.push({ ...r, values: valuesByRuleId.get(r.id) ?? [] })
    rulesByPromotionId.set(r.promotionId, arr)
  }
  return { rulesByPromotionId }
}

async function getFullPromotion(db: PygmalionDatabase, id: string) {
  const [promotion] = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.id, id), isNull(promotions.deletedAt)))
    .limit(1)
  if (!promotion) return null
  const [applicationMethod] = await db.select().from(promotionApplicationMethods).where(eq(promotionApplicationMethods.promotionId, id)).limit(1)
  const { rulesByPromotionId } = await loadRules(db, [id])
  const allRules = rulesByPromotionId.get(id) ?? []
  return {
    ...promotion,
    applicationMethod: applicationMethod ?? null,
    rules: allRules.filter((r) => r.scope === 'eligibility'),
    targetRules: allRules.filter((r) => r.scope === 'target'),
    buyRules: allRules.filter((r) => r.scope === 'buy'),
  }
}

export type FullPromotion = NonNullable<Awaited<ReturnType<typeof getFullPromotion>>>

async function getFullCampaign(db: PygmalionDatabase, id: string) {
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt))).limit(1)
  if (!campaign) return null
  const [budget] = await db.select().from(campaignBudgets).where(eq(campaignBudgets.campaignId, id)).limit(1)
  const attachedPromotions = await db.select({ id: promotions.id, code: promotions.code }).from(promotions).where(and(eq(promotions.campaignId, id), isNull(promotions.deletedAt)))
  return { ...campaign, budget: budget ?? null, promotions: attachedPromotions }
}

async function replaceRules(tx: PygmalionDatabase, promotionId: string, scope: 'eligibility' | 'target' | 'buy', rules: RuleInput[]) {
  const existing = await tx
    .select({ id: promotionRules.id })
    .from(promotionRules)
    .where(and(eq(promotionRules.promotionId, promotionId), eq(promotionRules.scope, scope)))
  if (existing.length) {
    await tx.delete(promotionRules).where(inArray(promotionRules.id, existing.map((r) => r.id)))
  }
  for (const r of rules) {
    const [row] = await tx
      .insert(promotionRules)
      .values({ id: pygId('promr'), promotionId, scope, attribute: r.attribute, operator: r.operator ?? 'eq' })
      .returning()
    await tx.insert(promotionRuleValues).values(r.values.map((v) => ({ id: pygId('promrv'), ruleId: row.id, value: v })))
  }
}

// --- Admin CRUD service ---------------------------------------------------------

export interface ListPromotionsOptions {
  limit?: number
  offset?: number
}

export interface ListCampaignsOptions {
  limit?: number
  offset?: number
}

export function createPromotionsService(ctx: ServiceContext) {
  return {
    async list({ limit = 20, offset = 0 }: ListPromotionsOptions = {}) {
      return ctx.db
        .select()
        .from(promotions)
        .where(isNull(promotions.deletedAt))
        .orderBy(asc(promotions.createdAt))
        .limit(limit)
        .offset(offset)
    },

    get: (id: string) => getFullPromotion(ctx.db, id),

    async create(input: CreatePromotionInput) {
      const data = createPromotionInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(promotions)
          .values({
            id: pygId('promo'),
            code: data.code ?? null,
            isAutomatic: data.isAutomatic ?? false,
            status: data.status ?? 'draft',
            type: data.type ?? 'standard',
            campaignId: data.campaignId ?? null,
            metadata: data.metadata ?? null,
          })
          .returning()
        const am = data.applicationMethod
        await tx.insert(promotionApplicationMethods).values({
          id: pygId('papm'),
          promotionId: row.id,
          target: am.target,
          allocation: am.allocation ?? 'each',
          valueType: am.valueType,
          value: am.value,
          currencyCode: am.currencyCode ?? null,
          maxQuantity: am.maxQuantity ?? null,
          buyRulesMinQuantity: am.buyRulesMinQuantity ?? null,
          applyToQuantity: am.applyToQuantity ?? null,
        })
        if (data.rules?.length) await replaceRules(tx, row.id, 'eligibility', data.rules)
        if (am.targetRules?.length) await replaceRules(tx, row.id, 'target', am.targetRules)
        if (am.buyRules?.length) await replaceRules(tx, row.id, 'buy', am.buyRules)
        await emitDomainEvent(tx, 'promotion.created', { id: row.id })
        return (await getFullPromotion(tx, row.id))!
      })
    },

    async update(id: string, input: UpdatePromotionInput) {
      const data = updatePromotionInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const set: Record<string, unknown> = { updatedAt: new Date() }
        if (data.code !== undefined) set.code = data.code
        if (data.isAutomatic !== undefined) set.isAutomatic = data.isAutomatic
        if (data.status !== undefined) set.status = data.status
        if (data.campaignId !== undefined) set.campaignId = data.campaignId
        if (data.metadata !== undefined) set.metadata = data.metadata
        const [row] = await tx
          .update(promotions)
          .set(set)
          .where(and(eq(promotions.id, id), isNull(promotions.deletedAt)))
          .returning()
        if (!row) return null
        if (data.rules !== undefined) await replaceRules(tx, id, 'eligibility', data.rules)
        if (data.applicationMethod !== undefined) {
          const am = data.applicationMethod
          const patch: Record<string, unknown> = { updatedAt: new Date() }
          if (am.target !== undefined) patch.target = am.target
          if (am.allocation !== undefined) patch.allocation = am.allocation
          if (am.valueType !== undefined) patch.valueType = am.valueType
          if (am.value !== undefined) patch.value = am.value
          if (am.currencyCode !== undefined) patch.currencyCode = am.currencyCode
          if (am.maxQuantity !== undefined) patch.maxQuantity = am.maxQuantity
          if (am.buyRulesMinQuantity !== undefined) patch.buyRulesMinQuantity = am.buyRulesMinQuantity
          if (am.applyToQuantity !== undefined) patch.applyToQuantity = am.applyToQuantity
          await tx.update(promotionApplicationMethods).set(patch).where(eq(promotionApplicationMethods.promotionId, id))
          if (am.targetRules !== undefined) await replaceRules(tx, id, 'target', am.targetRules)
          if (am.buyRules !== undefined) await replaceRules(tx, id, 'buy', am.buyRules)
        }
        await emitDomainEvent(tx, 'promotion.updated', { id: row.id })
        return (await getFullPromotion(tx, id))!
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(promotions)
          .set({ deletedAt: new Date() })
          .where(and(eq(promotions.id, id), isNull(promotions.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'promotion.deleted', { id: row.id })
        return row
      })
    },

    /** Batch add/remove for one rule scope (3 routes share this). */
    async batchRules(id: string, scope: 'eligibility' | 'target' | 'buy', input: PromotionRulesBatchInput) {
      const data = promotionRulesBatchInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [promotion] = await tx.select({ id: promotions.id }).from(promotions).where(and(eq(promotions.id, id), isNull(promotions.deletedAt))).limit(1)
        if (!promotion) return null
        if (data.remove?.length) {
          await tx.delete(promotionRules).where(and(eq(promotionRules.promotionId, id), eq(promotionRules.scope, scope), inArray(promotionRules.id, data.remove)))
        }
        for (const r of data.add ?? []) {
          const [row] = await tx.insert(promotionRules).values({ id: pygId('promr'), promotionId: id, scope, attribute: r.attribute, operator: r.operator ?? 'eq' }).returning()
          await tx.insert(promotionRuleValues).values(r.values.map((v) => ({ id: pygId('promrv'), ruleId: row.id, value: v })))
        }
        return (await getFullPromotion(tx, id))!
      })
    },

    ruleAttributeOptions,

    // --- Campaigns --------------------------------------------------------------

    async listCampaigns({ limit = 20, offset = 0 }: ListCampaignsOptions = {}) {
      return ctx.db.select().from(campaigns).where(isNull(campaigns.deletedAt)).orderBy(asc(campaigns.createdAt)).limit(limit).offset(offset)
    },

    async getCampaign(id: string) {
      return getFullCampaign(ctx.db, id)
    },

    async createCampaign(input: CreateCampaignInput) {
      const data = createCampaignInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(campaigns)
          .values({
            id: pygId('camp'),
            name: data.name,
            description: data.description ?? null,
            campaignIdentifier: data.campaignIdentifier ?? null,
            startsAt: data.startsAt ?? null,
            endsAt: data.endsAt ?? null,
            metadata: data.metadata ?? null,
          })
          .returning()
        if (data.budget) {
          await tx.insert(campaignBudgets).values({
            id: pygId('cbud'),
            campaignId: row.id,
            type: data.budget.type,
            currencyCode: data.budget.currencyCode ?? null,
            limitAmount: data.budget.limitAmount ?? null,
            attribute: data.budget.attribute ?? null,
          })
        }
        await emitDomainEvent(tx, 'campaign.created', { id: row.id })
        return (await getFullCampaign(tx, row.id))!
      })
    },

    async updateCampaign(id: string, input: UpdateCampaignInput) {
      const data = updateCampaignInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const set: Record<string, unknown> = { updatedAt: new Date() }
        if (data.name !== undefined) set.name = data.name
        if (data.description !== undefined) set.description = data.description
        if (data.campaignIdentifier !== undefined) set.campaignIdentifier = data.campaignIdentifier
        if (data.startsAt !== undefined) set.startsAt = data.startsAt
        if (data.endsAt !== undefined) set.endsAt = data.endsAt
        if (data.metadata !== undefined) set.metadata = data.metadata
        const [row] = await tx
          .update(campaigns)
          .set(set)
          .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
          .returning()
        if (!row) return null
        if (data.budget !== undefined) {
          await tx.delete(campaignBudgets).where(eq(campaignBudgets.campaignId, id))
          if (data.budget) {
            await tx.insert(campaignBudgets).values({
              id: pygId('cbud'),
              campaignId: id,
              type: data.budget.type,
              currencyCode: data.budget.currencyCode ?? null,
              limitAmount: data.budget.limitAmount ?? null,
              attribute: data.budget.attribute ?? null,
            })
          }
        }
        await emitDomainEvent(tx, 'campaign.updated', { id: row.id })
        return (await getFullCampaign(tx, id))!
      })
    },

    async removeCampaign(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(campaigns)
          .set({ deletedAt: new Date() })
          .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'campaign.deleted', { id: row.id })
        return row
      })
    },

    /** POST /admin/campaigns/:id/promotions: attach/detach. */
    async attachPromotions(id: string, input: CampaignPromotionsInput) {
      const data = campaignPromotionsInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [campaign] = await tx.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt))).limit(1)
        if (!campaign) return null
        if (data.add?.length) {
          await tx.update(promotions).set({ campaignId: id, updatedAt: new Date() }).where(inArray(promotions.id, data.add))
        }
        if (data.remove?.length) {
          await tx.update(promotions).set({ campaignId: null, updatedAt: new Date() }).where(and(eq(promotions.campaignId, id), inArray(promotions.id, data.remove)))
        }
        return tx.select({ id: promotions.id, code: promotions.code }).from(promotions).where(and(eq(promotions.campaignId, id), isNull(promotions.deletedAt)))
      })
    },
  }
}

export type PromotionsService = ReturnType<typeof createPromotionsService>

// --- Cart candidate loading + application ---
// Manual codes are recovered from the cart's EXISTING adjustment rows (not a
// separate "applied codes" table): the caller
// (`services/cart.ts::recalc`) reads `distinct code` off the current
// adjustments before this function deletes+recreates them, merges in any
// codes just requested/removed via the store route, and passes the final set
// in as `manualCodes`.

export interface CartPromotionParams {
  cartId: string
  /** Final desired set of manual promotion codes for this recalc (already merged add/remove). */
  manualCodes: string[]
  /** Post-`base()` totals state — `promotions-engine.ts` reads productId/shippingOptionId straight off it. */
  state: CartTotalsState
  currencyCode: string
  regionId: string | null
  customerGroupIds: string[]
  /** e.g. `{ customer_id: cart.customerId }` — resolves `use_by_attribute` budgets. */
  attributeValues: Record<string, string>
  now?: Date
}

export interface CartPromotionResult {
  state: CartTotalsState
  unknownCodes: string[]
}

function toEngineRules(rows: Array<{ attribute: string; operator: string; values: string[] }>): EngineRule[] {
  return rows.map((r) => ({ attribute: r.attribute, operator: r.operator as EngineRule['operator'], values: r.values }))
}

export async function applyCartPromotions(tx: PygmalionDatabase, params: CartPromotionParams): Promise<CartPromotionResult> {
  const now = params.now ?? new Date()
  const itemIds = params.state.items.map((i) => i.id)
  const shippingIds = params.state.shippingMethods.map((s) => s.id)
  const codes = [...new Set(params.manualCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))]

  // --- 1. Candidate promotions: automatic + requested manual codes. --------
  const codeFilter = codes.length ? inArray(promotions.code, codes) : undefined
  const candidateRows = await tx
    .select()
    .from(promotions)
    .where(and(isNull(promotions.deletedAt), eq(promotions.status, 'active'), codeFilter ? or(eq(promotions.isAutomatic, true), codeFilter) : eq(promotions.isAutomatic, true)))

  const unknownCodes = codes.filter((c) => !candidateRows.some((p) => p.code === c))
  const promotionIds = candidateRows.map((p) => p.id)

  // --- 2. Application methods + rules. --------------------------------------
  const amRows = promotionIds.length ? await tx.select().from(promotionApplicationMethods).where(inArray(promotionApplicationMethods.promotionId, promotionIds)) : []
  const amByPromotionId = new Map(amRows.map((a) => [a.promotionId, a]))
  const { rulesByPromotionId } = await loadRules(tx, promotionIds)

  // --- 3. This cart's PREVIOUS contribution (release) — read BEFORE we ever
  // touch `candidateRows`-only data: a promotion that dropped OUT of the
  // candidate set entirely this round (code removed, deactivated, deleted)
  // must still release whatever budget it consumed last time.
  const previousItemAdjustments = itemIds.length ? await tx.select().from(cartLineItemAdjustments).where(inArray(cartLineItemAdjustments.lineItemId, itemIds)) : []
  const previousShippingAdjustments = shippingIds.length ? await tx.select().from(cartShippingMethodAdjustments).where(inArray(cartShippingMethodAdjustments.shippingMethodId, shippingIds)) : []
  const previousAmountByPromotionId = new Map<string, number>()
  const previousAppliedPromotionIds = new Set<string>()
  for (const a of [...previousItemAdjustments, ...previousShippingAdjustments]) {
    if (!a.promotionId) continue
    previousAmountByPromotionId.set(a.promotionId, (previousAmountByPromotionId.get(a.promotionId) ?? 0) + a.amount)
    previousAppliedPromotionIds.add(a.promotionId)
  }

  // Campaigns/budgets to load = candidates' campaigns UNION any campaign a
  // now-dropped-out previously-applied promotion belonged to (release-only,
  // no `deletedAt`/`status` filter — a deleted/deactivated promotion's past
  // consumption still needs releasing).
  const droppedPromotionIds = [...previousAppliedPromotionIds].filter((id) => !promotionIds.includes(id))
  const droppedPromotionRows = droppedPromotionIds.length
    ? await tx.select({ id: promotions.id, campaignId: promotions.campaignId }).from(promotions).where(inArray(promotions.id, droppedPromotionIds))
    : []
  const campaignIdByPromotionId = new Map<string, string | null>([
    ...candidateRows.map((p): [string, string | null] => [p.id, p.campaignId]),
    ...droppedPromotionRows.map((p): [string, string | null] => [p.id, p.campaignId]),
  ])

  // --- 4. Campaigns + budgets. -----------------------------------------------
  const campaignIds = [...new Set([...campaignIdByPromotionId.values()].filter((id): id is string => id !== null))]
  const campaignRows = campaignIds.length ? await tx.select().from(campaigns).where(inArray(campaigns.id, campaignIds)) : []
  const campaignById = new Map(campaignRows.map((c) => [c.id, c]))
  const budgetRows = campaignIds.length ? await tx.select().from(campaignBudgets).where(inArray(campaignBudgets.campaignId, campaignIds)) : []
  const budgetByCampaignId = new Map(budgetRows.map((b) => [b.campaignId, b]))

  // Aggregate PER BUDGET (not per promotion) — several promotions can share
  // one campaign's budget, and every one of them must release/recommit
  // against the SAME consistent "usedByOthers" baseline, or two promos
  // sharing a budget would each subtract only their own slice of the
  // history and double-count the rest.
  const budgetIdByPromotionId = new Map<string, string>()
  for (const [promotionId, campaignId] of campaignIdByPromotionId) {
    const b = campaignId ? budgetByCampaignId.get(campaignId) : undefined
    if (b) budgetIdByPromotionId.set(promotionId, b.id)
  }
  const previousAmountByBudgetId = new Map<string, number>()
  const previousAppliedCountByBudgetId = new Map<string, number>()
  for (const [promotionId, budgetId] of budgetIdByPromotionId) {
    previousAmountByBudgetId.set(budgetId, (previousAmountByBudgetId.get(budgetId) ?? 0) + (previousAmountByPromotionId.get(promotionId) ?? 0))
    if (previousAppliedPromotionIds.has(promotionId)) {
      previousAppliedCountByBudgetId.set(budgetId, (previousAppliedCountByBudgetId.get(budgetId) ?? 0) + 1)
    }
  }

  const attributeValueByBudgetId = new Map<string, string | null>()
  const usageRowsToLoad: string[] = []
  for (const b of budgetRows) {
    if (b.type === 'use_by_attribute' && b.attribute) {
      const v = params.attributeValues[b.attribute] ?? null
      attributeValueByBudgetId.set(b.id, v)
      if (v) usageRowsToLoad.push(b.id)
    }
  }
  const usageRows = usageRowsToLoad.length ? await tx.select().from(campaignBudgetUsages).where(inArray(campaignBudgetUsages.budgetId, usageRowsToLoad)) : []
  const usageByBudgetAndValue = new Map(usageRows.map((u) => [`${u.budgetId}:${u.attributeValue}`, u.used]))

  // Single consistent "usedByOthers" per budget id (checked by the engine,
  // committed back below in step 7).
  const usedByOthersSpend = new Map<string, number>()
  const usedByOthersUsage = new Map<string, number>()
  const usedByOthersAttr = new Map<string, number>()
  for (const b of budgetRows) {
    const prevAmount = previousAmountByBudgetId.get(b.id) ?? 0
    const prevCount = previousAppliedCountByBudgetId.get(b.id) ?? 0
    usedByOthersSpend.set(b.id, b.usedAmount - prevAmount)
    usedByOthersUsage.set(b.id, b.usedAmount - prevCount)
    if (b.type === 'use_by_attribute') {
      const attrVal = attributeValueByBudgetId.get(b.id) ?? null
      const dbUsed = attrVal ? (usageByBudgetAndValue.get(`${b.id}:${attrVal}`) ?? 0) : 0
      usedByOthersAttr.set(b.id, dbUsed - prevCount)
    }
  }

  // --- 4. Item/shipping attribute context (product -> category/tag ids). ----
  const productIds = [...new Set(params.state.items.map((i) => i.productId).filter((id): id is string => id !== null))]
  const catRows = productIds.length ? await tx.select().from(productCategoryProduct).where(inArray(productCategoryProduct.productId, productIds)) : []
  const tagRows = productIds.length ? await tx.select().from(productTagProduct).where(inArray(productTagProduct.productId, productIds)) : []
  const categoriesByProductId = new Map<string, string[]>()
  for (const r of catRows) categoriesByProductId.set(r.productId, [...(categoriesByProductId.get(r.productId) ?? []), r.categoryId])
  const tagsByProductId = new Map<string, string[]>()
  for (const r of tagRows) tagsByProductId.set(r.productId, [...(tagsByProductId.get(r.productId) ?? []), r.tagId])

  const itemContext: Record<string, ItemAttributeContext> = {}
  for (const li of params.state.items) {
    itemContext[li.id] = {
      productId: li.productId,
      categoryIds: li.productId ? (categoriesByProductId.get(li.productId) ?? []) : [],
      tagIds: li.productId ? (tagsByProductId.get(li.productId) ?? []) : [],
      productTypeId: null, // no product-type entity in this codebase yet (see services/promotions.ts note)
    }
  }
  const shippingContext: Record<string, { shippingOptionId: string | null }> = {}
  for (const sm of params.state.shippingMethods) shippingContext[sm.id] = { shippingOptionId: sm.shippingOptionId }

  // --- 5. Build engine inputs. -----------------------------------------------
  const engineInputs: PromotionEngineInput[] = candidateRows.map((p) => {
    const am = amByPromotionId.get(p.id)
    const allRules = rulesByPromotionId.get(p.id) ?? []
    const application = am
      ? {
          target: am.target,
          allocation: am.allocation,
          valueType: am.valueType,
          value: am.value,
          maxQuantity: am.maxQuantity,
          buyRulesMinQuantity: am.buyRulesMinQuantity,
          applyToQuantity: am.applyToQuantity,
          targetRules: toEngineRules(allRules.filter((r) => r.scope === 'target')),
          buyRules: toEngineRules(allRules.filter((r) => r.scope === 'buy')),
        }
      : { target: 'items' as const, allocation: 'each' as const, valueType: 'fixed' as const, value: 0, maxQuantity: null, buyRulesMinQuantity: null, applyToQuantity: null, targetRules: [], buyRules: [] }

    const campaign = p.campaignId ? campaignById.get(p.campaignId) : undefined
    const budgetRow = p.campaignId ? budgetByCampaignId.get(p.campaignId) : undefined
    const budget = budgetRow
      ? {
          id: budgetRow.id,
          type: budgetRow.type,
          limit: budgetRow.limitAmount,
          usedByOthers: (budgetRow.type === 'spend' ? usedByOthersSpend : usedByOthersUsage).get(budgetRow.id) ?? budgetRow.usedAmount,
          attribute: budgetRow.attribute,
          usedByOthersForAttributeValue: budgetRow.type === 'use_by_attribute' ? (usedByOthersAttr.get(budgetRow.id) ?? 0) : 0,
        }
      : null

    return {
      id: p.id,
      code: p.code,
      type: p.type,
      rules: toEngineRules(allRules.filter((r) => r.scope === 'eligibility')),
      application,
      campaign: campaign || budget ? { startsAt: campaign?.startsAt ?? null, endsAt: campaign?.endsAt ?? null, budget } : null,
    }
  })

  const context = {
    now,
    currencyCode: params.currencyCode,
    regionId: params.regionId,
    customerGroupIds: params.customerGroupIds,
    attributeValues: params.attributeValues,
    items: itemContext,
    shippingMethods: shippingContext,
  }

  const result = computeAdjustments(params.state, engineInputs, context)

  // --- 6. Persist: delete+recreate adjustments. -----------------------------
  if (itemIds.length) await tx.delete(cartLineItemAdjustments).where(inArray(cartLineItemAdjustments.lineItemId, itemIds))
  if (shippingIds.length) await tx.delete(cartShippingMethodAdjustments).where(inArray(cartShippingMethodAdjustments.shippingMethodId, shippingIds))
  const itemAdjustmentRows = result.adjustments.filter((a) => a.target === 'item')
  const shippingAdjustmentRows = result.adjustments.filter((a) => a.target === 'shipping')
  if (itemAdjustmentRows.length) {
    await tx.insert(cartLineItemAdjustments).values(
      itemAdjustmentRows.map((a) => ({ id: pygId('clia'), lineItemId: a.targetId, promotionId: a.promotionId, code: a.code, description: a.description, amount: a.amount })),
    )
  }
  if (shippingAdjustmentRows.length) {
    await tx.insert(cartShippingMethodAdjustments).values(
      shippingAdjustmentRows.map((a) => ({ id: pygId('csma'), shippingMethodId: a.targetId, promotionId: a.promotionId, code: a.code, description: a.description, amount: a.amount })),
    )
  }

  // --- 7. Commit budget deltas (release+recommit — see engine input above). -
  const spendByBudget = new Map<string, number>()
  const usageByBudget = new Map<string, number>()
  const attributeUsageByBudget = new Map<string, { attributeValue: string; count: number }>()
  for (const d of result.budgetDeltas) {
    if (d.type === 'spend') spendByBudget.set(d.budgetId, (spendByBudget.get(d.budgetId) ?? 0) + d.amount)
    else if (d.type === 'usage') usageByBudget.set(d.budgetId, (usageByBudget.get(d.budgetId) ?? 0) + d.amount)
    else if (d.type === 'use_by_attribute' && d.attributeValue) {
      const cur = attributeUsageByBudget.get(d.budgetId)
      attributeUsageByBudget.set(d.budgetId, { attributeValue: d.attributeValue, count: (cur?.count ?? 0) + d.amount })
    }
  }
  // Every budget referenced by a CANDIDATE (not just an applied) promotion is
  // recomputed against its single `usedByOthers*` baseline (step 3) so a
  // promo that stopped applying this round correctly releases its stale
  // prior contribution, and promos sharing a budget stay consistent.
  for (const budgetRow of budgetRows) {
    if (budgetRow.type === 'spend') {
      const newUsed = (usedByOthersSpend.get(budgetRow.id) ?? budgetRow.usedAmount) + (spendByBudget.get(budgetRow.id) ?? 0)
      await tx.update(campaignBudgets).set({ usedAmount: newUsed, updatedAt: new Date() }).where(eq(campaignBudgets.id, budgetRow.id))
    } else if (budgetRow.type === 'usage') {
      const newUsed = (usedByOthersUsage.get(budgetRow.id) ?? budgetRow.usedAmount) + (usageByBudget.get(budgetRow.id) ?? 0)
      await tx.update(campaignBudgets).set({ usedAmount: newUsed, updatedAt: new Date() }).where(eq(campaignBudgets.id, budgetRow.id))
    } else {
      const attrValue = attributeValueByBudgetId.get(budgetRow.id)
      if (!attrValue) continue
      const count = attributeUsageByBudget.get(budgetRow.id)?.count ?? 0
      const oldForValue = usageByBudgetAndValue.get(`${budgetRow.id}:${attrValue}`) ?? 0
      const newForValue = (usedByOthersAttr.get(budgetRow.id) ?? 0) + count
      await tx
        .insert(campaignBudgetUsages)
        .values({ id: pygId('cbu'), budgetId: budgetRow.id, attributeValue: attrValue, used: newForValue })
        .onConflictDoUpdate({ target: [campaignBudgetUsages.budgetId, campaignBudgetUsages.attributeValue], set: { used: newForValue, updatedAt: new Date() } })
      // Denormalized aggregate across every attribute value (admin display
      // only — eligibility checks always use the per-value row above): shift
      // by the net change this cart made to its own resolved value's count.
      const delta = newForValue - oldForValue
      if (delta !== 0) {
        await tx.update(campaignBudgets).set({ usedAmount: budgetRow.usedAmount + delta, updatedAt: new Date() }).where(eq(campaignBudgets.id, budgetRow.id))
      }
    }
  }

  return { state: result.state, unknownCodes }
}
